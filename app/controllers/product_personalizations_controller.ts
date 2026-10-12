import type { HttpContext } from '@adonisjs/core/http'
import cache from '@adonisjs/cache/services/main'
import db from '@adonisjs/lucid/services/db'
import ModifierGroup from '#models/modifier_group'
import Product from '#models/product'
import ProductModifierGroup from '#models/product_modifier_group'
import ProductModifierOption from '#models/product_modifier_option'
import { syncProductPersonalizationsValidator } from '#validators/modifier_personalization'
import InventoryAccessService from '#services/inventory/inventory_access_service'
import InventoryLedgerService from '#services/inventory/inventory_ledger_service'
import { InventoryError } from '#services/inventory/inventory_math'
import { io } from '#start/socket'

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

  async sync(ctx: HttpContext) {
    const { params, request, response, companyId } = ctx
    const trx = await db.transaction()

    try {
      const productId = Number(params.id)
      if (ctx.locationId) await trx.from('locations').where('company_id', companyId).where('id', ctx.locationId).forUpdate().firstOrFail()
      await Product.query({ client: trx })
        .where('id', productId)
        .where('company_id', companyId)
        .forUpdate()
        .firstOrFail()

      const payload = await request.validateUsing(syncProductPersonalizationsValidator)
      const currentAssignments = await ProductModifierGroup.query({ client: trx })
        .where('company_id', companyId)
        .where('product_id', productId)
        .preload('optionSettings', (optionPriceQuery) => {
          optionPriceQuery.where('company_id', companyId)
        })
      const currentPrices = new Map<string, number>()
      currentAssignments.forEach((assignment) => {
        assignment.optionSettings.forEach((setting) => {
          currentPrices.set(
            `${assignment.modifierGroupId}:${setting.modifierOptionId}`,
            Number(setting.priceAdjustment || 0),
          )
        })
      })
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
        const submittedOptions = assignment.options || []
        const submittedOptionIds = submittedOptions.map((option) => option.modifierOptionId)

        if (new Set(submittedOptionIds).size !== submittedOptionIds.length) {
          await trx.rollback()
          return response.unprocessableEntity({
            message: `Una opción del grupo "${group.name}" fue enviada más de una vez.`,
          })
        }

        const activeOptionIds = new Set(group.options.map((option) => option.id))
        if (submittedOptionIds.some((optionId) => !activeOptionIds.has(optionId))) {
          await trx.rollback()
          return response.unprocessableEntity({
            message: `Una opción del grupo "${group.name}" no está disponible.`,
          })
        }

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

      const obsoleteComponentsQuery = trx.from('product_option_inventory_components').where('company_id', companyId).where('product_id', productId)
      if (groupIds.length) obsoleteComponentsQuery.whereNotIn('modifier_group_id', groupIds)
      const obsoleteComponents = await obsoleteComponentsQuery.forUpdate()
      if (obsoleteComponents.length) {
        const scope = await InventoryAccessService.scope(ctx, true, trx)
        await new InventoryLedgerService(trx, scope).operation('components', { reason: 'Se retiraron grupos de opciones del producto.',
          details: JSON.stringify({ productId, removedComponents: obsoleteComponents }) })
        await trx.from('product_option_inventory_components').where('company_id', companyId).where('product_id', productId)
          .whereIn('id', obsoleteComponents.map((c: any) => c.id)).delete()
        trx.after('commit', () => { try { io.to(`inventory_company_${companyId}`).emit('inventory_changed') } catch (error) { ctx.logger.warn({err: error}, 'Inventory notification failed') } })
      }

      await ProductModifierGroup.query({ client: trx })
        .where('company_id', companyId)
        .where('product_id', productId)
        .delete()

      for (const [index, assignment] of payload.groups.entries()) {
        const createdAssignment = await ProductModifierGroup.create(
          {
            companyId,
            productId,
            modifierGroupId: assignment.modifierGroupId,
            minSelections: assignment.isRequired ? assignment.selectionLimit : 0,
            maxSelections: assignment.selectionLimit,
            allowOptionQuantities: assignment.allowOptionQuantities,
            displayOrder: assignment.displayOrder ?? index,
          },
          { client: trx },
        )

        const group = groupsMap.get(assignment.modifierGroupId)!
        const optionPrices = assignment.options === undefined
          ? group.options.map((option) => ({
              modifierOptionId: option.id,
              priceAdjustment:
                currentPrices.get(`${assignment.modifierGroupId}:${option.id}`) || 0,
            }))
          : assignment.options

        const pricedOptions = optionPrices.filter(
          (option) => Number(option.priceAdjustment || 0) > 0,
        )
        if (pricedOptions.length) {
          await ProductModifierOption.createMany(
            pricedOptions.map((option) => ({
              companyId,
              productModifierGroupId: createdAssignment.id,
              modifierOptionId: option.modifierOptionId,
              priceAdjustment: Number(option.priceAdjustment),
            })),
            { client: trx },
          )
        }
      }

      await trx.commit()
      await this.clearCache(companyId, productId)

      const result = await this.getPayload(productId, companyId, true)
      return response.ok(result)
    } catch (error) {
      if (!trx.isCompleted) {
        await trx.rollback()
      }
      if (error instanceof InventoryError) return response.status(error.status).send({ message: error.message, code: error.code })
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
          .preload('optionSettings', (optionPriceQuery) => {
            optionPriceQuery.where('company_id', companyId)
          })
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
        options: assignment.modifierGroup.options.map((option) => {
          const setting = assignment.optionSettings.find(
            (candidate) => candidate.modifierOptionId === option.id,
          )
          return {
            id: option.id,
            modifierGroupId: option.modifierGroupId,
            name: option.name,
            displayOrder: option.displayOrder,
            isActive: option.isActive,
            priceAdjustment: Number(setting?.priceAdjustment || 0),
          }
        }),
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
