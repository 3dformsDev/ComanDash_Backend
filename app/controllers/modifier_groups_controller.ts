import type { HttpContext } from '@adonisjs/core/http'
import cache from '@adonisjs/cache/services/main'
import ModifierGroup from '#models/modifier_group'
import {
  createModifierGroupValidator,
  updateModifierGroupValidator,
} from '#validators/modifier_personalization'

export default class ModifierGroupsController {
  async index({ response, companyId, getQueryData }: HttpContext) {
    const queryData = getQueryData()
    const page = queryData.page || 1
    const perPage = queryData.perPage || 100
    const activeOnly = queryData.isActive === '1' || queryData.isActive === 1
    const namespaceKey = `modifier-groups:${companyId}`
    const cacheKey = `page:${page}:perPage:${perPage}:activeOnly:${activeOnly}`

    try {
      const result = await cache.namespace(namespaceKey).getOrSet({
        key: cacheKey,
        factory: async () => {
          const query = ModifierGroup.withCompanyFilter(companyId)

          if (activeOnly) {
            query.where('is_active', true)
          }

          const groups = await query
            .preload('options', (optionQuery) => {
              if (activeOnly) {
                optionQuery.where('is_active', true)
              }
              optionQuery.orderBy('display_order', 'asc').orderBy('name', 'asc')
            })
            .orderBy('display_order', 'asc')
            .orderBy('name', 'asc')
            .paginate(page, perPage)

          return groups.toJSON()
        },
        ttl: '10m',
      })

      return response.ok(result)
    } catch (error) {
      return response.internalServerError({
        message: 'No fue posible consultar los grupos de opciones.',
        error: error.message,
      })
    }
  }

  async store({ request, response, companyId }: HttpContext) {
    try {
      const payload = await request.validateUsing(createModifierGroupValidator)
      const group = await ModifierGroup.create({
        ...payload,
        description: payload.description ?? null,
        displayOrder: payload.displayOrder ?? 0,
        isActive: payload.isActive ?? true,
        companyId,
      })

      await this.clearCache(companyId)
      await group.load('options')

      return response.created(group)
    } catch (error) {
      return this.handleWriteError(error, request.input('name'), response)
    }
  }

  async show({ params, response, companyId }: HttpContext) {
    try {
      const group = await ModifierGroup.withCompanyFilter(companyId)
        .where('id', params.id)
        .preload('options', (query) => query.orderBy('display_order', 'asc').orderBy('name', 'asc'))
        .firstOrFail()

      return response.ok(group)
    } catch (error) {
      return response.notFound({ message: 'El grupo de opciones no fue encontrado.' })
    }
  }

  async update({ params, request, response, companyId }: HttpContext) {
    try {
      const group = await ModifierGroup.withCompanyFilter(companyId)
        .where('id', params.id)
        .firstOrFail()
      const payload = await request.validateUsing(updateModifierGroupValidator)

      group.merge(payload)
      await group.save()
      await this.clearCache(companyId)
      await group.load('options', (query) => query.orderBy('display_order', 'asc').orderBy('name', 'asc'))

      return response.ok(group)
    } catch (error) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ message: 'El grupo de opciones no fue encontrado.' })
      }
      return this.handleWriteError(error, request.input('name'), response)
    }
  }

  async destroy({ params, response, companyId }: HttpContext) {
    try {
      const group = await ModifierGroup.withCompanyFilter(companyId)
        .where('id', params.id)
        .firstOrFail()

      group.isActive = false
      await group.save()
      await this.clearCache(companyId)

      return response.ok({
        success: true,
        message: 'Grupo de opciones desactivado correctamente.',
      })
    } catch (error) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ message: 'El grupo de opciones no fue encontrado.' })
      }
      return response.internalServerError({
        message: 'No fue posible desactivar el grupo de opciones.',
        error: error.message,
      })
    }
  }

  private async clearCache(companyId: number) {
    await cache.namespace(`modifier-groups:${companyId}`).clear()
    await cache.namespace(`products:${companyId}`).clear()
  }

  private handleWriteError(error: any, name: string | undefined, response: HttpContext['response']) {
    if (error.code === 'E_VALIDATION_ERROR' || error.code === 'E_VALIDATION_FAILURE') {
      return response.unprocessableEntity({ errors: error.messages })
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return response.conflict({
        message: `Ya existe un grupo de opciones llamado "${name}" en esta empresa.`,
      })
    }
    return response.internalServerError({
      message: 'No fue posible guardar el grupo de opciones.',
      error: error.message,
    })
  }
}
