import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import Order from '#models/order'
import User from '#models/user'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class OrderStatusHistory extends BaseModel {
  // Asigna explícitamente el nombre de la tabla si no sigue la convención
  public static table = 'order_status_history'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare orderId: number

  @column()
  declare previousStatus: string | null

  @column()
  declare newStatus: string

  @column()
  declare changedBy: number

  @column()
  declare reason: string | null

  @column.dateTime({ autoCreate: true })
  declare changedAt: DateTime

  /**
   * RELACIONES
   */
  @belongsTo(() => Order)
  declare order: BelongsTo<typeof Order>

  @belongsTo(() => User, {
    foreignKey: 'changedBy', // Especifica la clave foránea personalizada
  })
  declare user: BelongsTo<typeof User>
}