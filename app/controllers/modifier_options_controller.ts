import type { HttpContext } from '@adonisjs/core/http'
import cache from '@adonisjs/cache/services/main'
import ModifierGroup from '#models/modifier_group'
import ModifierOption from '#models/modifier_option'
import {
  createModifierOptionValidator,
  updateModifierOptionValidator,
} from '#validators/modifier_personalization'

export default class ModifierOptionsController {
  async index({ request, response, companyId }: HttpContext) {
    try {
      const groupId = Number(request.input('modifierGroupId'))
      const activeOnly = request.input('isActive') === '1' || request.input('isActive') === 1
      const query = ModifierOption.withCompanyFilter(companyId)

      if (Number.isInteger(groupId) && groupId > 0) {
        query.where('modifier_group_id', groupId)
      }
      if (activeOnly) {
        query.where('is_active', true)
      }

      const options = await query.orderBy('display_order', 'asc').orderBy('name', 'asc')
      return response.ok(options)
    } catch (error) {
      return response.internalServerError({
        message: 'No fue posible consultar las opciones.',
        error: error.message,
      })
    }
  }

  async store({ request, response, companyId }: HttpContext) {
    try {
      const payload = await request.validateUsing(createModifierOptionValidator)
      await this.ensureGroupBelongsToCompany(payload.modifierGroupId, companyId)

      const option = await ModifierOption.create({
        ...payload,
        priceAdjustment: 0,
        displayOrder: payload.displayOrder ?? 0,
        isActive: payload.isActive ?? true,
        companyId,
      })

      await this.clearCache(companyId)
      return response.created(option)
    } catch (error) {
      return this.handleWriteError(error, request.input('name'), response)
    }
  }

  async show({ params, response, companyId }: HttpContext) {
    try {
      const option = await ModifierOption.withCompanyFilter(companyId)
        .where('id', params.id)
        .preload('modifierGroup')
        .firstOrFail()

      return response.ok(option)
    } catch (error) {
      return response.notFound({ message: 'La opcion no fue encontrada.' })
    }
  }

  async update({ params, request, response, companyId }: HttpContext) {
    try {
      const option = await ModifierOption.withCompanyFilter(companyId)
        .where('id', params.id)
        .firstOrFail()
      const payload = await request.validateUsing(updateModifierOptionValidator)

      if (payload.modifierGroupId !== undefined) {
        await this.ensureGroupBelongsToCompany(payload.modifierGroupId, companyId)
      }

      option.merge({ ...payload, priceAdjustment: 0 })
      await option.save()
      await this.clearCache(companyId)

      return response.ok(option)
    } catch (error) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ message: 'La opcion o su grupo no fueron encontrados.' })
      }
      return this.handleWriteError(error, request.input('name'), response)
    }
  }

  async destroy({ params, response, companyId }: HttpContext) {
    try {
      const option = await ModifierOption.withCompanyFilter(companyId)
        .where('id', params.id)
        .firstOrFail()

      option.isActive = false
      await option.save()
      await this.clearCache(companyId)

      return response.ok({ success: true, message: 'Opcion desactivada correctamente.' })
    } catch (error) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ message: 'La opcion no fue encontrada.' })
      }
      return response.internalServerError({
        message: 'No fue posible desactivar la opcion.',
        error: error.message,
      })
    }
  }

  private async ensureGroupBelongsToCompany(groupId: number, companyId: number) {
    return ModifierGroup.withCompanyFilter(companyId)
      .where('id', groupId)
      .where('is_active', true)
      .firstOrFail()
  }

  private async clearCache(companyId: number) {
    await cache.namespace(`modifier-groups:${companyId}`).clear()
    await cache.namespace(`products:${companyId}`).clear()
  }

  private handleWriteError(error: any, name: string | undefined, response: HttpContext['response']) {
    if (error.code === 'E_VALIDATION_ERROR' || error.code === 'E_VALIDATION_FAILURE') {
      return response.unprocessableEntity({ errors: error.messages })
    }
    if (error.code === 'E_ROW_NOT_FOUND') {
      return response.unprocessableEntity({
        message: 'El grupo seleccionado no existe, esta inactivo o pertenece a otra empresa.',
      })
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return response.conflict({ message: `Ya existe una opcion llamada "${name}" en este grupo.` })
    }
    return response.internalServerError({
      message: 'No fue posible guardar la opcion.',
      error: error.message,
    })
  }
}
