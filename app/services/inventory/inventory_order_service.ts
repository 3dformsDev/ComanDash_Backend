import { randomUUID } from 'node:crypto'
import { HttpContext } from '@adonisjs/core/http'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Order from '#models/order'
import OrderItem from '#models/order_item'
import InventoryAccessService, { type InventoryScope } from './inventory_access_service.js'
import InventoryLedgerService from './inventory_ledger_service.js'
import InventoryMutationService from './inventory_mutation_service.js'
import { demand, InventoryError, reductions, returnQuantity, returnValue, units, type Component } from './inventory_math.js'
import { Decimal } from 'decimal.js'

export default class InventoryOrderService {
  static sameOptions(current: any[], next: any[]) {
    const signature = (list: any[]) => list.map((s) => `${s.modifierGroupId}:${s.modifierOptionId}:${s.quantity}`).sort().join('|')
    return signature(current) === signature(next)
  }
  static identity(current: OrderItem | undefined, selections: any[]) {
    const same = current && this.sameOptions(current.modifierSelections || [], selections)
    return { inventoryLineKey: same ? current.inventoryLineKey || randomUUID() : randomUUID(),
      inventoryComposition: same ? current.inventoryComposition || [] : null }
  }
  static async composition(trx: TransactionClientContract, scope: InventoryScope, productId: number, selections: any[]): Promise<Component[]> {
    const components: Component[] = []
    // Option components are company-wide while stock is location-specific. Hold a
    // shared product lock so configuration cannot be replaced midway through a sale.
    await trx.from('products').where('company_id', scope.companyId).where('id', productId).forShare().firstOrFail()
    const direct = await trx.from('inventory_balances as b').join('products as p', 'p.id', 'b.product_id')
      .where('b.company_id', scope.companyId).where('p.company_id', scope.companyId)
      .where('b.location_id', scope.locationId).where('b.product_id', productId).where('b.enabled', true).select('p.name').forUpdate().first()
    if (direct) components.push({ productId, name: direct.name, units: 1, origin: 'product' })
    for (const selected of selections) {
      units(Number(selected.quantity), 1)
      const rows = await trx.from('product_option_inventory_components as c').join('products as p', 'p.id', 'c.component_product_id')
        .join('inventory_balances as b', 'b.product_id', 'p.id')
        .where('c.company_id', scope.companyId).where('p.company_id', scope.companyId).where('b.company_id', scope.companyId)
        .where('b.location_id', scope.locationId).where('b.enabled', true).where('c.product_id', productId)
        .where('c.modifier_group_id', selected.modifierGroupId).where('c.modifier_option_id', selected.modifierOptionId)
        .select('c.component_product_id', 'c.units', 'p.name', 'p.is_active', 'p.is_available').forUpdate()
      for (const row of rows) {
        if (!row.is_active || !row.is_available) throw new InventoryError(`El producto ${row.name} de esta opción no está disponible.`, 'INVENTORY_COMPONENT_UNAVAILABLE', 409)
        components.push({ productId: Number(row.component_product_id), name: row.name,
          units: units(Number(row.units) * Number(selected.quantity), 1), origin: `option:${selected.modifierOptionId}` })
      }
    }
    return components
  }
  static async sources(trx: TransactionClientContract, scope: InventoryScope, orderId: number, lock = false) {
    const query = trx.from('inventory_order_consumptions').where('company_id', scope.companyId)
      .where('location_id', scope.locationId).where('order_id', orderId).orderBy('id', 'desc')
    return lock ? query.forUpdate() : query
  }
  static reductions(sources: any[], desired: Map<string, Map<number, number>>) {
    return reductions(sources, desired)
  }
  static async assertVersion(ctx: HttpContext, order: Order) {
    if (ctx.request.input('expectedOrderVersion') !== Number(order.inventoryVersion)) {
      throw new InventoryError('El pedido cambió. Actualiza la vista antes de continuar.', 'INVENTORY_ORDER_CHANGED', 409)
    }
  }
  static async apply(ctx: HttpContext, order: Order, trx: TransactionClientContract, mode: 'sale' | 'edit' | 'return', financialChange = 0) {
    const scope = await InventoryAccessService.scope(ctx, false, trx)
    const ledger = new InventoryLedgerService(trx, scope)
    const items = await OrderItem.query({ client: trx }).where('order_id', order.id).forUpdate().preload('modifierSelections', (q) => q.forUpdate())
    const desired = new Map<string, Map<number, number>>()
    const compositions = new Map<string, Component[]>()
    for (const item of items) {
      units(Number(item.quantity), 1)
      if (mode === 'return') continue
      if (!item.inventoryLineKey) item.inventoryLineKey = randomUUID()
      if (item.inventoryComposition === null) {
        item.inventoryComposition = await this.composition(trx, scope, item.productId, item.modifierSelections)
      }
      await item.save()
      const components = item.inventoryComposition || []
      desired.set(item.inventoryLineKey, demand(components, Number(item.quantity)))
      compositions.set(item.inventoryLineKey, components)
    }
    const sources = await this.sources(trx, scope, order.id, true)
    const reductions = this.reductions(sources, desired)
    const allIds = [...sources.map((s: any) => Number(s.product_id)), ...[...desired.values()].flatMap((v) => [...v.keys()])]
    const balances = await ledger.lock(allIds)
    const rawReturns = ctx.request.input('inventoryReturns', [])
    if (!Array.isArray(rawReturns) || rawReturns.length > 2000) throw new InventoryError('Revisa los productos que vuelven al inventario.')
    const returns = new Map<number, any>()
    for (const entry of rawReturns) {
      if (!entry || returns.has(entry.consumptionId)) throw new InventoryError('Una devolución aparece más de una vez.')
      returns.set(entry.consumptionId, entry)
    }
    if (returns.size !== reductions.length || reductions.some((r) => !returns.has(Number(r.source.id)))) {
      throw new InventoryError('Revisa cuántas unidades vuelven al inventario antes de confirmar.', 'INVENTORY_RETURN_REVIEW', 409)
    }
    let operation: number | undefined
    const operationId = async () => {
      if (operation !== undefined) return operation
      operation = await ledger.operation(mode === 'return' ? 'return' : mode === 'edit' ? 'order_edit' : 'sale', {
        order_id: order.id, order_number: String(order.orderNumber), reason: ctx.request.input('reason') || null,
        business_date: ctx.cashRegisterBusinessDate || null,
      })
      return operation
    }
    for (const { source, quantity } of reductions) {
      const currentOperation = await operationId()
      const input = returns.get(Number(source.id))
      const reason = typeof input.reason === 'string' ? input.reason.slice(0, 1000).trim() : ''
      const { recovered, notRecovered } = returnQuantity(quantity, input.recoveredQuantity, reason)
      const values = returnValue(Number(source.quantity), String(source.value_amount), Number(source.resolved_quantity), String(source.resolved_value), quantity, recovered)
      const balance = balances.get(Number(source.product_id))
      const apply = Boolean(balance?.enabled)
      if (recovered && apply) await ledger.move(currentOperation, balance, recovered, source.product_name, String(source.unit_cost), values.recoveredValue)
      await trx.table('inventory_return_details').insert({ operation_id: currentOperation, consumption_id: source.id,
        removed_quantity: quantity, recovered_quantity: recovered, not_recovered_quantity: notRecovered,
        recovered_value: values.recoveredValue, reason: reason || null, applied_to_stock: apply })
      source.resolved_quantity = Number(source.resolved_quantity) + quantity
      await trx.from('inventory_order_consumptions').where('id', source.id).where('company_id', scope.companyId)
        .where('location_id', scope.locationId).update({ resolved_quantity: source.resolved_quantity, resolved_value: values.resolvedValue })
    }
    for (const [lineKey, products] of desired) {
      for (const [productId, total] of products) {
        const balance = balances.get(productId)
        if (!balance?.enabled) continue
        const existing = sources.filter((s: any) => s.line_key === lineKey && Number(s.product_id) === productId)
          .reduce((sum: number, s: any) => sum + Number(s.quantity) - Number(s.resolved_quantity), 0)
        const added = total - existing
        if (added <= 0) continue
        const composition = compositions.get(lineKey)!
        const name = composition.find((c) => c.productId === productId)!.name
        const movement = await ledger.move(await operationId(), balance, -added, name)
        await trx.table('inventory_order_consumptions').insert({ company_id: scope.companyId, location_id: scope.locationId,
          order_id: order.id, line_key: lineKey, product_id: productId, product_name: name, quantity: added,
          resolved_quantity: 0, unit_cost: movement.unitCost, value_amount: new Decimal(movement.valueDelta).abs().toFixed(6),
          resolved_value: '0', movement_id: movement.id, composition_snapshot: JSON.stringify(composition) })
      }
    }
    order.inventoryVersion = Number(order.inventoryVersion || 0) + 1
    await order.save()
    // Updates use a bulk query for totals and other fields. Refresh before
    // persisting the idempotent response so a retry never receives stale data.
    await order.refresh()
    await order.load('orderItems', (q) => q.preload('product').preload('modifierSelections'))
    await order.load('adjustments')
    await order.load('payments', (q) => q.preload('paymentMethod'))
    await order.load('table')
    const result = mode === 'sale' ? order.serialize() : mode === 'return'
      ? { order: order.serialize(), message: 'La orden ha sido cancelada exitosamente.', refundProcessed: financialChange > 0, refundAmount: financialChange }
      : { order: order.serialize(), message: 'Operación guardada.', financialChange }
    await InventoryMutationService.finish(ctx, trx, result)
    return result
  }
}
