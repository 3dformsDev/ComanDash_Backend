// app/models/payment_method.ts
import { DateTime } from 'luxon'
import { column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import Company from '#models/company'
import OrderPayment from '#models/order_payment'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import TenantBase from './tenant_base.js'

// Tipo para el `enum` para mejor autocompletado y seguridad
export type PaymentMethodType = 'cash' | 'card' | 'digital' | 'transfer' | 'other'

export default class PaymentMethod extends TenantBase {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number

  @column()
  declare name: string

  @column()
  declare type: PaymentMethodType

  @column()
  declare requiresReference: boolean

  @column()
  declare isActive: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /**
   * RELACIONES
   */
  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  @hasMany(() => OrderPayment)
  declare orderPayments: HasMany<typeof OrderPayment>
}