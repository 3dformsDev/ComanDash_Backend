import { createHash } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import db from '@adonisjs/lucid/services/db'
import { InventoryError, json } from './inventory_math.js'
import { now } from './inventory_ledger_service.js'
import { io } from '#start/socket'

export default class InventoryMutationService {
  static identity(ctx: HttpContext) {
    const key = ctx.request.header('Idempotency-Key')
    if (!key || !/^[a-zA-Z0-9_-]{16,100}$/.test(key)) {
      throw new InventoryError('Actualiza la aplicación antes de guardar esta operación.', 'INVENTORY_UPDATE_REQUIRED', 409)
    }
    return { company_id: ctx.companyId, location_id: ctx.locationId!, actor_id: ctx.auth.user!.id, request_key: key }
  }
  static fingerprint(ctx: HttpContext) {
    return createHash('sha256').update(JSON.stringify([ctx.request.method(), ctx.request.url(), ctx.request.body()])).digest('hex')
  }
  static async replay(ctx: HttpContext, trx?: TransactionClientContract) {
    const inherited = trx || ctx.cashTransactionTrx
    const client = inherited && !inherited.isCompleted ? inherited : db
    const row = await client.from('inventory_mutation_requests').where(this.identity(ctx)).first()
    if (!row) return null
    if (row.fingerprint !== this.fingerprint(ctx)) throw new InventoryError('La solicitud cambió. Revisa el pedido y vuelve a confirmar.', 'INVENTORY_REQUEST_CHANGED', 409)
    return json<any>(row.result, null)
  }
  static async begin(ctx: HttpContext, trx: TransactionClientContract) {
    const identity = this.identity(ctx)
    // Serialize control/configuration transitions with sales in the same location.
    // Current reads below remain authoritative even if the cash guard opened a snapshot.
    await trx.from('locations').where('id', identity.location_id)
      .where('company_id', identity.company_id).forUpdate().firstOrFail()
    const row = await trx.from('inventory_mutation_requests').where(identity).forUpdate().first()
    if (row) throw new InventoryError('Esta operación ya se guardó. Actualiza la vista.', 'INVENTORY_ALREADY_SAVED', 409)
    await trx.table('inventory_mutation_requests').insert({ ...identity, fingerprint: this.fingerprint(ctx), created_at: now() })
  }
  static async finish(ctx: HttpContext, trx: TransactionClientContract, result: any) {
    await trx.from('inventory_mutation_requests').where(this.identity(ctx)).update({ result: JSON.stringify(result) })
    trx.after('commit', () => {
      try { io.to(`inventory_${ctx.companyId}_${ctx.locationId}`).emit('inventory_changed') }
      catch (error) { ctx.logger.warn({ err: error }, 'Inventory notification failed after commit') }
    })
  }
}
