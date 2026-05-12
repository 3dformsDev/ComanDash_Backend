import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import Order from '#models/order'
import Product from '#models/product'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { Decimal } from 'decimal.js'

// Tipos para el estado de la cocina para mayor seguridad
export type KitchenStatus = 'pending' | 'in_preparation' | 'ready' | 'served'

export default class OrderItem extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare orderId: number

  @column()
  declare productId: number

  @column()
  declare quantity: number

  @column()
  declare unitPrice: number

  @column()
  declare totalPrice: number

  @column()
  declare specialInstructions: string | null

  @column()
  declare kitchenStatus: KitchenStatus

  @column.dateTime()
  declare kitchenStartedAt: DateTime | null

  @column.dateTime()
  declare kitchenReadyAt: DateTime | null

  @column.dateTime()
  declare servedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  /**
   * RELACIONES
   */
  @belongsTo(() => Order)
  declare order: BelongsTo<typeof Order>

  @belongsTo(() => Product)
  declare product: BelongsTo<typeof Product>

  /**
   * MÉTODOS HELPER PARA CÁLCULOS
   */
  getTotalPriceAsDecimal(): Decimal {
    return new Decimal(this.totalPrice || 0)
  }
}