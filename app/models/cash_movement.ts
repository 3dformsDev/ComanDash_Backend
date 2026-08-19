import { DateTime } from 'luxon'
import { column, belongsTo } from '@adonisjs/lucid/orm'
import CashRegisterSession from './cash_registers_session.js'
import Order from './order.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import { Decimal } from 'decimal.js'
import TenantBase from './tenant_base.js'

export default class CashMovement extends TenantBase {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number

  @column()
  declare cashRegisterSessionId: number

  @column.date()
  declare businessDate?: DateTime | null

  @column()
  declare orderId?: number

  @column()
  declare userId: number

  @column()
  declare movementType: 'sale' | 'withdrawal' | 'deposit'

  @column()
  declare notes: string

  @column()
  declare amount: number

  @column.dateTime()
  declare createdAt: DateTime

  // Relaciones
  @belongsTo(() => CashRegisterSession)
  declare cashRegisterSession: BelongsTo<typeof CashRegisterSession>

  @belongsTo(() => Order)
  declare order: BelongsTo<typeof Order>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  /**
  * MÉTODOS HELPER PARA CÁLCULOS
  */
  getAmountAsDecimal(): Decimal {
    return new Decimal(this.amount || 0)
  }
}
