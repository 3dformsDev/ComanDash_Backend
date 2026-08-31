import type { HttpContext } from '@adonisjs/core/http'
import cache from '@adonisjs/cache/services/main'
import db from '@adonisjs/lucid/services/db'
import ModifierGroup from '#models/modifier_group'
import Product from '#models/product'
import ProductModifierGroup from '#models/product_modifier_group'
import { syncProductPersonalizationsValidator } from '#validators/modifier_personalization'

export default class ProductPersonalizationsController {
  async show({ params, request, response, companyId }: HttpContext) {
    try {
      const includeInactive =
        request.input('includeInactive') === 'true' || request.input('includeInactive') === true
      const payload = await this.getPayload(Number(params.id), companyId, includeInactive)
      return response.ok(payload)
    } catch (error) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ message: 'El producto no fue encontrado.' })
      }
      return response.internalServerError({
        message: 'No fue posible consultar las personalizaciones del producto.',
        error: error.message,
      })
    }
  }

  async sync({ params, request, response, companyId }: HttpContext) {
    const trx = await db.transaction()

    try {
      const productId = Number(params.id)
      await Product.query({ client: trx })
        .where('id', productId)
        .where('company_id', companyId)
        .firstOrFail()

      const payload = await request.validateUsing(syncProductPersonalizationsValidator)
      const groupIds = payload.groups.map((group) => group.modifierGroupId)
      const uniqueGroupIds = new Set(groupIds)

      if (uniqueGroupIds.size !== groupIds.length) {
        await trx.rollback()
        return response.unprocessableEntity({
          message: 'Un grupo de opciones no puede asociarse dos veces al mismo producto.',
        })
      }

      const groups = groupIds.length
        ? await ModifierGroup.query({ client: trx })
            .where('company_id', companyId)
            .where('is_active', true)
            .whereIn('id', groupIds)
            .preload('options', (query) => query.where('is_active', true))
        : []

      if (groups.length !== groupIds.length) {
        await trx.rollback()
        return response.unprocessableEntity({
          message: 'Uno o mas grupos no existen, estan inactivos o pertenecen a otra empresa.',
        })
      }

      const groupsMap = new Map(groups.map((group) => [group.id, group]))
      for (const assignment of payload.groups) {
        const group = groupsMap.get(assignment.modifierGroupId)!
        const activeOptionsCount = group.options.length

        if (activeOptionsCount === 0) {
          await trx.rollback()
          return response.unprocessableEntity({
            message: `El grupo "${group.name}" debe tener al menos una opcion activa.`,
          })
        }

        if (!assignment.allowOptionQuantities && assignment.selectionLimit > activeOptionsCount) {
          await trx.rollback()
          return response.unprocessableEntity({
            message: `El grupo "${group.name}" no tiene suficientes opciones distintas para ${assignment.selectionLimit} elecciones.`,
          })
        }
      }

      await ProductModifierGroup.query({ client: trx })
        .where('company_id', companyId)
        .where('product_id', productId)
        .delete()

      if (payload.groups.length) {
        await ProductModifierGroup.createMany(
          payload.groups.map((assignment, index) => ({
            companyId,
            productId,
            modifierGroupId: assignment.modifierGroupId,
            minSelections: assignment.isRequired ? assignment.selectionLimit : 0,
            maxSelections: assignment.selectionLimit,
            allowOptionQuantities: assignment.allowOptionQuantities,
            displayOrder: assignment.displayOrder ?? index,
          })),
          { client: trx },
        )
      }

      await trx.commit()
      await this.clearCache(companyId, productId)

      const result = await this.getPayload(productId, companyId, true)
      return response.ok(result)
    } catch (error) {
      if (!trx.isCompleted) {
        await trx.rollback()
      }
      if (error.code === 'E_VALIDATION_ERROR' || error.code === 'E_VALIDATION_FAILURE') {
        return response.unprocessableEntity({ errors: error.messages })
      }
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ message: 'El producto no fue encontrado.' })
      }
      return response.internalServerError({
        message: 'No fue posible guardar las personalizaciones del producto.',
        error: error.message,
      })
    }
  }

  private async getPayload(productId: number, companyId: number, includeInactive: boolean) {
    const product = await Product.withCompanyFilter(companyId)
      .where('id', productId)
      .preload('modifierGroupAssignments', (assignmentQuery) => {
        assignmentQuery
          .orderBy('display_order', 'asc')
          .preload('modifierGroup', (groupQuery) => {
            if (!includeInactive) {
              groupQuery.where('is_active', true)
            }
            groupQuery.preload('options', (optionQuery) => {
              if (!includeInactive) {
                optionQuery.where('is_active', true)
              }
              optionQuery.orderBy('display_order', 'asc').orderBy('name', 'asc')
            })
          })
      })
      .firstOrFail()

    const assignments = product.modifierGroupAssignments
      .filter((assignment) => assignment.modifierGroup)
      .map((assignment) => ({
        id: assignment.id,
        modifierGroupId: assignment.modifierGroupId,
        name: assignment.modifierGroup.name,
        description: assignment.modifierGroup.description,
        isActive: assignment.modifierGroup.isActive,
        isRequired: assignment.minSelections > 0,
        selectionLimit: assignment.maxSelections,
        allowOptionQuantities: assignment.allowOptionQuantities,
        displayOrder: assignment.displayOrder,
        options: assignment.modifierGroup.options.map((option) => ({
          id: option.id,
          modifierGroupId: option.modifierGroupId,
          name: option.name,
          displayOrder: option.displayOrder,
          isActive: option.isActive,
          priceAdjustment: 0,
        })),
      }))

    return {
      productId: product.id,
      productName: product.name,
      hasPersonalizations: assignments.some(
        (assignment) => assignment.isActive && assignment.options.some((option) => option.isActive),
      ),
      groups: assignments,
    }
  }

  private async clearCache(companyId: number, productId: number) {
    await cache.namespace(`products:${companyId}`).clear()
    await cache.namespace(`modifier-groups:${companyId}`).clear()
    await cache.delete({ key: `product:${productId}` })
  }
}
