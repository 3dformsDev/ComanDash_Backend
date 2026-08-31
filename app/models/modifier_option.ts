import { DateTime } from 'luxon'
import { belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Company from '#models/company'
import ModifierGroup from '#models/modifier_group'
import OrderItemModifierSelection from '#models/order_item_modifier_selection'
import TenantBase from './tenant_base.js'

export default class ModifierOption extends TenantBase {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number

  @column()
  declare modifierGroupId: number

  @column()
  declare name: string

  @column()
  declare priceAdjustment: number

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

  @belongsTo(() => ModifierGroup)
  declare modifierGroup: BelongsTo<typeof ModifierGroup>

  @hasMany(() => OrderItemModifierSelection)
  declare orderItemSelections: HasMany<typeof OrderItemModifierSelection>
}
