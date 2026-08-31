import { DateTime } from 'luxon'
import { belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import Company from '#models/company'
import Location from '#models/location'
import Table from '#models/table'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import TenantBase from './tenant_base.js'

export type TableZoneIconType = 'table' | 'bar' | 'terrace' | 'special'

export default class TableZone extends TenantBase {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number

  @column()
  declare locationId: number

  @column()
  declare name: string

  @column()
  declare iconType: TableZoneIconType

  @column()
  declare displayOrder: number

  @column({
    consume: (value: unknown) => Boolean(value),
    prepare: (value: boolean) => value ? 1 : 0,
  })
  declare isActive: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  @belongsTo(() => Location)
  declare location: BelongsTo<typeof Location>

  @hasMany(() => Table, {
    foreignKey: 'zoneId',
  })
  declare tables: HasMany<typeof Table>
}
