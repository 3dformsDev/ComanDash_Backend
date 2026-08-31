import { DateTime } from 'luxon'
import { belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Company from '#models/company'
import ModifierOption from '#models/modifier_option'
import ProductModifierGroup from '#models/product_modifier_group'
import TenantBase from './tenant_base.js'

export default class ModifierGroup extends TenantBase {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number

  @column()
  declare name: string

  @column()
  declare description: string | null

  @column()
  declare displayOrder: number

  @column()
  declare isActive: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  @hasMany(() => ModifierOption)
  declare options: HasMany<typeof ModifierOption>

  @hasMany(() => ProductModifierGroup)
  declare productAssignments: HasMany<typeof ProductModifierGroup>
}
