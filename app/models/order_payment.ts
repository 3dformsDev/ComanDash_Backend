// app/models/order_payment.ts
import { DateTime } from 'luxon'
import { column, belongsTo } from '@adonisjs/lucid/orm'
import Order from '#models/order'
import PaymentMethod from '#models/payment_method'
import User from '#models/user'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import CashRegisterSession from './cash_registers_session.js'
import TenantBase from './tenant_base.js'
import { Decimal } from 'decimal.js'

export default class OrderPayment extends TenantBase {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare orderId: number

  @column()
  declare paymentMethodId: number

  @column()
  declare cashRegisterSessionId: number | null

  @column.date()
  declare businessDate?: DateTime | null

  @column()
  declare amount: number

  @column()
  declare referenceNumber: string | null

  @column()
  declare processedBy: number

  @column.dateTime({ autoCreate: true })
  declare processedAt: DateTime

  @column()
  declare notes: string | null

  /**
   * RELACIONES
   */
  @belongsTo(() => Order)
  declare order: BelongsTo<typeof Order>

  @belongsTo(() => PaymentMethod)
  declare paymentMethod: BelongsTo<typeof PaymentMethod>

  @belongsTo(() => CashRegisterSession)
  declare cashRegisterSession: BelongsTo<typeof CashRegisterSession>

  @belongsTo(() => User, {
    foreignKey: 'processedBy', // Especifica la clave foránea personalizada
  })
  declare processor: BelongsTo<typeof User>


  /**
  * MÉTODOS HELPER PARA CÁLCULOS
  */
  getAmountAsDecimal(): Decimal {
    return new Decimal(this.amount || 0)
  }
}
