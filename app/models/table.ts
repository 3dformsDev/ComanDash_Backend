import { DateTime } from 'luxon'
import { column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import Company from '#models/company'
import Location from '#models/location'
import Order from '#models/order'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import TenantBase from './tenant_base.js'

export default class Table extends TenantBase {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number

  @column()
  declare locationId: number

  @column({ columnName: 'number' }) // Mapeo explícito para evitar palabra reservada
  declare tableNumber: string

  @column()
  declare capacity: number

  @column()
  declare zone: string | null

  @column({
    consume: (value: any) => Boolean(value), // cuando se lee de la BD → 0/1 a true/false
    prepare: (value: boolean) => value ? 1 : 0, // cuando se guarda → true/false a 0/1
  })
  declare isBussy: boolean

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

  @belongsTo(() => Location)
  declare location: BelongsTo<typeof Location>

  @hasMany(() => Order)
  declare orders: HasMany<typeof Order>
}