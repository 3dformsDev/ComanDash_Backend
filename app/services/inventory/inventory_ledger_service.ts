import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import { InventoryError, valuation } from './inventory_math.js'
import type { InventoryScope } from './inventory_access_service.js'

export const now = () => DateTime.utc().toSQL({ includeOffset: false })!
export default class InventoryLedgerService {
  constructor(public trx: TransactionClientContract, public scope: InventoryScope) {}
  balances() { return this.trx.from('inventory_balances').where('company_id', this.scope.companyId).where('location_id', this.scope.locationId) }
  async lock(productIds: number[]) {
    const rows = productIds.length ? await this.balances().whereIn('product_id', [...new Set(productIds)].sort((a,b) => a-b)).orderBy('product_id').forUpdate() : []
    return new Map<number, any>(rows.map((r: any) => [Number(r.product_id), r]))
  }
  async operation(type: string, details: Record<string, any> = {}) {
    const [id] = await this.trx.table('inventory_operations').insert({ company_id: this.scope.companyId,
      location_id: this.scope.locationId, actor_id: this.scope.actorId, actor_name: this.scope.actorName,
      actor_role: this.scope.role, type, ...details, created_at: now() })
    return Number(id)
  }
  async move(operationId: number, balance: any, quantity: number, name: string, cost?: string, incomingValue?: string) {
    if (!balance || !balance.enabled) throw new InventoryError('Activa el inventario del producto antes de registrar esta operación.')
    const next = valuation(Number(balance.quantity), String(balance.carrying_value), quantity, cost, incomingValue)
    const [id] = await this.trx.table('inventory_movements').insert({ operation_id: operationId,
      company_id: this.scope.companyId, location_id: this.scope.locationId, product_id: balance.product_id,
      product_name: name, quantity, quantity_before: balance.quantity, quantity_after: next.quantity,
      value_delta: next.delta, control_epoch: balance.control_epoch, created_at: now() })
    balance.quantity = next.quantity; balance.carrying_value = next.value; balance.version = Number(balance.version) + 1
    await this.balances().where('id', balance.id).update({ quantity: balance.quantity,
      carrying_value: balance.carrying_value, version: balance.version, updated_at: now() })
    return { id: Number(id), unitCost: next.unitCost, valueDelta: next.delta }
  }
}
