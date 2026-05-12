import { DateTime } from 'luxon'
import { column, belongsTo } from '@adonisjs/lucid/orm'
import Company from './company.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import TenantBase from './tenant_base.js'

export default class Category extends TenantBase {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number

  @column()
  declare name: string

  @column()
  declare displayOrder: number

  @column()
  declare isActive: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relaciones
  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>
}