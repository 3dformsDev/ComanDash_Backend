import type { HttpContext } from '@adonisjs/core/http'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { Decimal } from 'decimal.js'
import cache from '@adonisjs/cache/services/main'
import Order from '#models/order'
import Access, { type InventoryScope } from '#services/inventory/inventory_access_service'
import Ledger, { now } from '#services/inventory/inventory_ledger_service'
import Mutation from '#services/inventory/inventory_mutation_service'
import Orders from '#services/inventory/inventory_order_service'
import { demand, InventoryError, json, money, units } from '#services/inventory/inventory_math'
import { io } from '#start/socket'

const shortText = (value: unknown, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const componentKey = (row: any) => [Number(row.modifier_group_id), Number(row.modifier_option_id),
  Number(row.component_product_id), Number(row.units)].join(':')
export default class InventoryController {
  private async execute(ctx: HttpContext, write: boolean,
    work: (trx: TransactionClientContract, scope: InventoryScope) => Promise<any>, manage = write) {
    let trx: TransactionClientContract | undefined
    let authorized = false
    try {
      const scope = await Access.scope(ctx, manage)
      authorized = true
      if (write) { const previous = await Mutation.replay(ctx); if (previous) return ctx.response.ok(previous) }
      trx = await db.transaction()
      if (write) await Mutation.begin(ctx, trx)
      const result = await work(trx, scope)
      if (write) await Mutation.finish(ctx, trx, result)
      await trx.commit()
      return ctx.response.ok(result)
    } catch (error) {
      if (trx && !trx.isCompleted) await trx.rollback()
      if (write && authorized) {
        try { const previous = await Mutation.replay(ctx); if (previous) return ctx.response.ok(previous) } catch {}
      }
      if (error instanceof InventoryError) return ctx.response.status(error.status).send({ message: error.message, code: error.code })
      if (error.code === 'E_ROW_NOT_FOUND') return ctx.response.notFound({ message: 'No se encontró el registro en tu negocio.' })
      ctx.logger.error({ err: error }, 'Inventory operation failed')
      return ctx.response.status(500).send({ message: 'No se pudo completar la operación. Intenta nuevamente.' })
    }
  }
  private async product(trx: TransactionClientContract, scope: InventoryScope, id: unknown) {
    const product = await trx.from('products').where('company_id', scope.companyId).where('id', units(Number(id), 1)).first()
    if (!product) throw new InventoryError('No se encontró el producto.', 'INVENTORY_PRODUCT_NOT_FOUND', 404)
    return product
  }
  async balances(ctx: HttpContext) {
    return this.execute(ctx, false, async (trx, scope) => {
      const products = await trx.from('products as p').leftJoin('categories as c', (join) => join.on('c.id', 'p.category_id').andOn('c.company_id', 'p.company_id'))
        .where('p.company_id', scope.companyId).select('p.id', 'p.name', 'p.category_id', 'c.name as category',
          'p.cost', 'p.price', 'p.is_active', 'p.is_available').orderBy('p.name').limit(10001)
      if (products.length > 10000) throw new InventoryError('La consulta contiene demasiados productos. Contacta a soporte.')
      const balances = await new Ledger(trx, scope).balances()
      const byProduct = new Map(balances.map((b: any) => [Number(b.product_id), b]))
      const components = await trx.from('product_option_inventory_components as component')
        .join('modifier_options as option', (join) => join.on('option.id', 'component.modifier_option_id')
          .andOn('option.company_id', 'component.company_id'))
        .join('modifier_groups as modifier_group', (join) => join.on('modifier_group.id', 'component.modifier_group_id')
          .andOn('modifier_group.company_id', 'component.company_id'))
        .where('component.company_id', scope.companyId)
        .select('component.*', 'modifier_group.name as group_name', 'option.name as option_name')
      const canManage = Access.canManage(scope.role)
      return { asOf: DateTime.utc().toISO(), canManage, role: scope.role,
        data: products.map((p: any) => {
          const b: any = byProduct.get(Number(p.id)); const enabled = Boolean(b?.enabled)
          return { productId: Number(p.id), name: p.name, categoryId: p.category_id, category: p.category,
            active: Boolean(p.is_active), available: Boolean(p.is_available), enabled, price: p.price,
            quantity: enabled ? Number(b.quantity) : null, minimumQuantity: Number(b?.minimum_quantity || 0),
            version: Number(b?.version || 0), status: !enabled ? 'untracked' : Number(b.quantity) === 0 ? 'empty'
              : Number(b.quantity) <= Number(b.minimum_quantity) ? 'low' : 'available',
            ...(canManage ? { cost: p.cost, value: enabled ? b.carrying_value : null,
              averageCost: enabled && Number(b.quantity) ? new Decimal(b.carrying_value).div(b.quantity).toFixed(6) : '0' } : {}) }
        }), components: components.map((c: any) => ({ productId: c.product_id, modifierGroupId: c.modifier_group_id,
          modifierOptionId: c.modifier_option_id, componentProductId: c.component_product_id, units: c.units,
          groupName: c.group_name, optionName: c.option_name })) }
    })
  }
  async control(ctx: HttpContext) {
    return this.execute(ctx, true, async (trx, scope) => {
      const product = await this.product(trx, scope, ctx.params.id)
      const ledger = new Ledger(trx, scope)
      let balance = await ledger.balances().where('product_id', product.id).forUpdate().first()
      const body = ctx.request.body()
      if (typeof body.enabled !== 'boolean') throw new InventoryError('Selecciona si deseas controlar este producto.')
      if (body.expectedVersion !== Number(balance?.version || 0)) throw new InventoryError('El inventario cambió. Actualiza la vista.', 'INVENTORY_CHANGED', 409)
      const minimum = units(body.minimumQuantity)
      if (body.components !== undefined) {
        await this.saveComponents(trx, scope, product, body.components)
        trx.after('commit', () => {
          try { io.to(`inventory_company_${scope.companyId}`).emit('inventory_changed') }
          catch (error) { ctx.logger.warn({ err: error }, 'Company inventory notification failed') }
        })
      }
      const dependencies = await trx.from('product_option_inventory_components').where('company_id', scope.companyId)
        .where('component_product_id', product.id).forUpdate()
      if (balance?.enabled && !body.enabled && body.confirmDependencies !== true) {
        const message = dependencies.length
          ? 'Confirma que deseas dejar de controlar este producto. También dejará de descontarse cuando se venda dentro de opciones.'
          : 'Confirma que deseas dejar de controlar este producto.'
        throw new InventoryError(message, 'INVENTORY_DISABLE_CONFIRMATION', 409)
      }
      const initial = !balance || Number(balance.control_epoch) === 0
      if (!balance) {
        const [id] = await trx.table('inventory_balances').insert({ company_id: scope.companyId, location_id: scope.locationId,
          product_id: product.id, updated_at: now() })
        balance = { id, product_id: product.id, quantity: 0, carrying_value: '0', enabled: false, control_epoch: 0, version: 0 }
      }
      const starting = body.enabled && !balance.enabled
      const quantity = starting ? units(body.quantity) : Number(balance.quantity)
      const value = starting ? money(body.unitCost).mul(quantity) : new Decimal(balance.carrying_value)
      if (value.greaterThanOrEqualTo('100000000000000')) throw new InventoryError('El valor supera el límite permitido.')
      const epoch = Number(balance.control_epoch) + (starting ? 1 : 0)
      const type = starting ? initial ? 'initial' : 'reactivation' : body.enabled ? 'configuration' : 'disabled'
      const op = await ledger.operation(type, { reason: shortText(body.reason) || null,
        details: JSON.stringify({ productId: product.id, productName: product.name, enabled: body.enabled,
          previousQuantity: balance.quantity, quantity, previousMinimum: balance.minimum_quantity || 0, minimumQuantity: minimum,
          dependencies: dependencies.map((d: any) => d.product_id) }) })
      if (starting) await trx.table('inventory_movements').insert({ operation_id: op, company_id: scope.companyId,
        location_id: scope.locationId, product_id: product.id, product_name: product.name,
        quantity: quantity - Number(balance.quantity), quantity_before: balance.quantity, quantity_after: quantity,
        value_delta: value.minus(balance.carrying_value).toFixed(6), control_epoch: epoch, created_at: now() })
      await ledger.balances().where('id', balance.id).update({ enabled: body.enabled, quantity, carrying_value: value.toFixed(6),
        minimum_quantity: minimum, control_epoch: epoch, version: Number(balance.version) + 1, updated_at: now() })
      return { message: 'Inventario actualizado.', operationId: op }
    })
  }
  async receipts(ctx: HttpContext) {
    return this.execute(ctx, true, async (trx, scope) => {
      const body = ctx.request.body()
      if (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > 100) throw new InventoryError('Agrega entre 1 y 100 productos.')
      if (body.lines.some((line: unknown) => !line || typeof line !== 'object' || Array.isArray(line))) throw new InventoryError('Revisa los productos de la entrada.')
      const lines = body.lines.map((l: any) => ({ ...l, productId: units(l.productId, 1),
        quantity: l.packs !== undefined ? units(units(l.packs, 1) * units(l.unitsPerPack, 1), 1) : units(l.quantity, 1),
        unitCost: money(l.unitCost).toFixed(6) }))
      if (new Set(lines.map((l: any) => l.productId)).size !== lines.length) throw new InventoryError('Agrega cada producto una sola vez.')
      const ledger = new Ledger(trx, scope); const balances = await ledger.lock(lines.map((l: any) => l.productId))
      const catalogueChanges: Array<{ productId: number; productName: string; previousCost: any; previousPrice: any; cost?: string; price?: string }> = []
      for (const line of lines) {
        const product = await this.product(trx, scope, line.productId)
        if (line.updateProductCost === true || line.newPrice !== undefined) {
          const update: Record<string, any> = {}
          if (line.updateProductCost === true) update.cost = money(line.unitCost).toFixed(2)
          if (line.newPrice !== undefined) {
            const price = money(line.newPrice); if (!price.greaterThan(0)) throw new InventoryError('El precio de venta debe ser mayor que cero.')
            update.price = price.toFixed(2)
          }
          if (Object.values(update).some((value) => new Decimal(value).greaterThan('99999999.99'))) throw new InventoryError('El costo o precio del producto supera el valor permitido.')
          catalogueChanges.push({ productId: product.id, productName: product.name, previousCost: product.cost,
            previousPrice: product.price, ...update })
          await trx.from('products').where('company_id', scope.companyId).where('id', product.id).update(update)
        }
      }
      const op = await ledger.operation('receipt', { supplier: shortText(body.supplier, 255) || null,
        reference: shortText(body.reference, 255) || null, reason: shortText(body.reason) || null,
        details: JSON.stringify({ lines, catalogueChanges }) })
      for (const line of lines) {
        const product = await this.product(trx, scope, line.productId)
        await ledger.move(op, balances.get(line.productId), line.quantity, product.name, line.unitCost)
      }
      if (catalogueChanges.length) trx.after('commit', async () => {
        try {
          await cache.namespace(`products:${scope.companyId}`).clear()
          await Promise.all(catalogueChanges.map((p) => cache.delete({ key: `product:${p.productId}` })))
        } catch (error) { ctx.logger.warn({ err: error }, 'Catalogue cache invalidation failed after inventory receipt') }
      })
      return { message: 'Entrada registrada.', operationId: op }
    })
  }
  async adjustments(ctx: HttpContext) {
    return this.execute(ctx, true, async (trx, scope) => {
      const body = ctx.request.body(); const delta = body.quantity
      if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 1000000000) throw new InventoryError('Ingresa las unidades que entran o salen.')
      const reason = shortText(body.reason); if (!reason) throw new InventoryError('Explica el motivo del ajuste.')
      const product = await this.product(trx, scope, body.productId)
      const ledger = new Ledger(trx, scope); const balance = (await ledger.lock([product.id])).get(product.id)
      if (!balance || body.expectedVersion !== Number(balance.version)) throw new InventoryError('El inventario cambió. Actualiza la vista.', 'INVENTORY_CHANGED', 409)
      const op = await ledger.operation('adjustment', { reason })
      await ledger.move(op, balance, delta, product.name, delta > 0 ? money(body.unitCost).toFixed(6) : undefined)
      return { message: 'Ajuste registrado.', operationId: op }
    })
  }
  private async saveComponents(trx: TransactionClientContract, scope: InventoryScope, product: any, lines: any) {
      if (!Array.isArray(lines) || lines.length > 300) throw new InventoryError('Revisa los productos incluidos en las opciones.')
      // Serialize the company-wide option recipe with sales at every location.
      await trx.from('products').where('company_id', scope.companyId).where('id', product.id).forUpdate().firstOrFail()
      const seen = new Set<string>(); const records = []
      for (const line of lines) {
        if (!line || typeof line !== 'object' || Array.isArray(line)) throw new InventoryError('Revisa el contenido de la opción.')
        const component = await this.product(trx, scope, line.componentProductId)
        const optionId = units(line.modifierOptionId, 1); const groupId = units(line.modifierGroupId, 1)
        const assignment = await trx.from('product_modifier_groups as a').join('modifier_options as o', 'o.modifier_group_id', 'a.modifier_group_id')
          .where('a.product_id', product.id).where('a.company_id', scope.companyId).where('o.company_id', scope.companyId)
          .where('a.modifier_group_id', groupId).where('o.id', optionId).first()
        if (!assignment) throw new InventoryError('Esta opción ya no pertenece al producto. Actualiza la vista.')
        const key = `${optionId}:${component.id}`
        if (seen.has(key)) throw new InventoryError('Un producto está repetido en la misma opción.')
        seen.add(key)
        records.push({ company_id: scope.companyId, product_id: product.id, modifier_group_id: groupId,
          modifier_option_id: optionId, component_product_id: component.id, units: units(line.units, 1) })
      }
      const previous = await trx.from('product_option_inventory_components').where('company_id', scope.companyId).where('product_id', product.id)
        .select('modifier_group_id', 'modifier_option_id', 'component_product_id', 'units').forUpdate()
      const previousKeys = previous.map(componentKey).sort()
      const nextKeys = records.map(componentKey).sort()
      if (previousKeys.length === nextKeys.length && previousKeys.every((key, index) => key === nextKeys[index])) return null
      await trx.from('product_option_inventory_components').where('company_id', scope.companyId).where('product_id', product.id).delete()
      if (records.length) await trx.table('product_option_inventory_components').insert(records)
      const op = await new Ledger(trx, scope).operation('components', { details: JSON.stringify({ productId: product.id,
        productName: product.name, previous, components: records }) })
      return { message: 'Contenido de las opciones guardado.', operationId: op }
  }
  async preview(ctx: HttpContext) {
    return this.execute(ctx, false, async (trx, scope) => {
      if (['cook', 'kitchen'].includes(scope.role)) throw new InventoryError('No tienes permiso para cancelar pedidos.', 'INVENTORY_FORBIDDEN', 403)
      const order = await Order.query({ client: trx }).where('company_id', scope.companyId).where('location_id', scope.locationId)
        .where('id', ctx.params.id).preload('orderItems', (q) => q.preload('modifierSelections')).firstOrFail()
      if (order.status === 'cancelled') throw new InventoryError('El pedido ya está cancelado.', 'INVENTORY_ORDER_CHANGED', 409)
      if (ctx.request.input('expectedOrderVersion') !== Number(order.inventoryVersion)) throw new InventoryError('El pedido cambió. Actualiza la vista.', 'INVENTORY_ORDER_CHANGED', 409)
      const desired = new Map<string, Map<number, number>>()
      if (ctx.request.input('mode') === 'edit') {
        const next = ctx.request.input('orderItems')
        if (!Array.isArray(next)) throw new InventoryError('No se pudo revisar el pedido.')
        const seen = new Set<number>()
        for (const line of next) {
          if (!line.orderItemId) continue
          if (seen.has(line.orderItemId)) throw new InventoryError('Una línea del pedido aparece repetida.')
          seen.add(line.orderItemId)
          const current = order.orderItems.find((i) => i.id === line.orderItemId)
          if (current?.inventoryLineKey && Orders.sameOptions(current.modifierSelections, line.modifierSelections || current.modifierSelections)) {
            desired.set(current.inventoryLineKey, demand(current.inventoryComposition || [], Math.min(units(line.quantity), current.quantity)))
          }
        }
      } else if (ctx.request.input('mode') !== 'return') throw new InventoryError('Selecciona la operación que deseas revisar.')
      const reductions = Orders.reductions(await Orders.sources(trx, scope, order.id), desired)
      return { orderVersion: Number(order.inventoryVersion), items: reductions.map(({ source, quantity }) => ({
        consumptionId: Number(source.id), productId: Number(source.product_id), name: source.product_name,
        quantity, recoveredQuantity: quantity, reason: '' })) }
    })
  }
  async movements(ctx: HttpContext) {
    return this.execute(ctx, false, async (trx, scope) => {
      const query = trx.from('inventory_operations as o').where('o.company_id', scope.companyId).where('o.location_id', scope.locationId)
      for (const [field, operator] of [['from', '>='], ['to', '<=']] as const) {
        const input = ctx.request.input(field)
        if (input) {
          const date = DateTime.fromISO(String(input), { zone: 'America/Bogota' })
          if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || !date.isValid) throw new InventoryError('Revisa las fechas del reporte.')
          query.where('o.created_at', operator, (field === 'to' ? date.endOf('day') : date.startOf('day')).toUTC().toSQL({ includeOffset: false })!)
        }
      }
      if (ctx.request.input('type')) query.where('o.type', String(ctx.request.input('type')))
      if (ctx.request.input('actorId')) query.where('o.actor_id', units(Number(ctx.request.input('actorId')), 1))
      if (ctx.request.input('orderNumber')) query.where('o.order_number', String(ctx.request.input('orderNumber')))
      if (ctx.request.input('companyOrderNumber')) query.whereExists(
        trx.from('orders as inventory_order').whereColumn('inventory_order.id', 'o.order_id')
          .where('inventory_order.company_id', scope.companyId)
          .where('inventory_order.company_order_number', units(Number(ctx.request.input('companyOrderNumber')), 1))
      )
      if (ctx.request.input('maxId')) query.where('o.id', '<=', units(Number(ctx.request.input('maxId')), 1))
      if (ctx.request.input('beforeId')) query.where('o.id', '<', units(Number(ctx.request.input('beforeId')), 1))
      const productId = ctx.request.input('productId') ? units(Number(ctx.request.input('productId')), 1) : null
      if (productId) query.where((q) => q.whereExists(trx.from('inventory_movements as m').whereColumn('m.operation_id', 'o.id')
        .where('m.company_id', scope.companyId).where('m.location_id', scope.locationId).where('m.product_id', productId))
        .orWhereExists(trx.from('inventory_return_details as r').join('inventory_order_consumptions as s', 's.id', 'r.consumption_id')
          .whereColumn('r.operation_id', 'o.id').where('s.company_id', scope.companyId).where('s.location_id', scope.locationId).where('s.product_id', productId))
        .orWhereRaw("JSON_UNQUOTE(JSON_EXTRACT(o.details, '$.productId')) = ?", [String(productId)]))
      if (ctx.request.input('notRecovered') === 'true') query.whereExists(trx.from('inventory_return_details as r')
        .whereColumn('r.operation_id', 'o.id').where('r.not_recovered_quantity', '>', 0))
      const rows = await query.select('o.*')
        .select(trx.raw('(SELECT linked_order.company_order_number FROM orders linked_order WHERE linked_order.id = o.order_id AND linked_order.company_id = ? LIMIT 1) as company_order_number', [scope.companyId]))
        .select(trx.raw("DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') as occurred_at_utc"))
        .orderBy('o.id', 'desc').limit(51)
      const ids = rows.slice(0, 50).map((op: any) => op.id)
      const moves = ids.length ? await trx.from('inventory_movements').where('company_id', scope.companyId).where('location_id', scope.locationId).whereIn('operation_id', ids) : []
      const returns = ids.length ? await trx.from('inventory_return_details as r').join('inventory_order_consumptions as s', 's.id', 'r.consumption_id')
        .where('s.company_id', scope.companyId).where('s.location_id', scope.locationId).whereIn('r.operation_id', ids)
        .select('r.*', 's.product_id', 's.product_name') : []
      const actors = await trx.from('inventory_operations').where('company_id', scope.companyId).where('location_id', scope.locationId)
        .select('actor_id').max('actor_name as actor_name').groupBy('actor_id').orderBy('actor_name')
      const data = rows.slice(0, 50).map((op: any) => ({ ...op, created_at: DateTime.fromSQL(op.occurred_at_utc, { zone: 'utc' }).toISO(),
        details: json(op.details, null), movements: moves.filter((m: any) => m.operation_id === op.id), returns: returns.filter((r: any) => r.operation_id === op.id) }))
      return { asOf: DateTime.utc().toISO(), maxId: Number(ctx.request.input('maxId') || rows[0]?.id || 0),
        nextBeforeId: rows.length > 50 ? Number(rows[49].id) : null, data, actors }
    }, true)
  }
}
