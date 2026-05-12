import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import Location from './location.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'

export default class DeviceToken extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare locationId: number

  @column()
  declare token: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /**
   * Define la relación "pertenece a" con el modelo Location.
   * Cada token de dispositivo está asociado a una única sucursal.
   */
  @belongsTo(() => Location)
  declare location: BelongsTo<typeof Location>

  @belongsTo(() => User)
  public declare user: BelongsTo<typeof User>
}