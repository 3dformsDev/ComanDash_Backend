import type { HttpContext } from '@adonisjs/core/http'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { InventoryError } from './inventory_math.js'

export interface InventoryScope { companyId: number; locationId: number; actorId: number; actorName: string; role: string }
export default class InventoryAccessService {
  static async scope(ctx: HttpContext, manage = false, trx?: TransactionClientContract): Promise<InventoryScope> {
    const user = await ctx.auth.getUserOrFail()
    const inherited = trx || ctx.cashTransactionTrx
    await user.load('role', (query) => {
      if (inherited && !inherited.isCompleted) query.useTransaction(inherited)
    })
    const role = user.role?.code || ''
    if (!ctx.companyId || !ctx.locationId) throw new InventoryError('No se pudo identificar tu negocio.', 'INVENTORY_CONTEXT', 403)
    if (manage && !this.canManage(role)) throw new InventoryError('No tienes permiso para modificar el inventario.', 'INVENTORY_FORBIDDEN', 403)
    if (!['super_admin', 'admin', 'manager', 'cashier', 'waiter', 'cook', 'kitchen'].includes(role)) {
      throw new InventoryError('No tienes permiso para consultar el inventario.', 'INVENTORY_FORBIDDEN', 403)
    }
    return { companyId: ctx.companyId, locationId: ctx.locationId, actorId: user.id, actorName: user.fullName, role }
  }
  static canManage(role: string) { return ['super_admin', 'admin', 'manager'].includes(role) }
}
