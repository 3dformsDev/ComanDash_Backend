import { DateTime } from 'luxon'
import { belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Company from '#models/company'
import ModifierOption from '#models/modifier_option'
import ProductModifierGroup from '#models/product_modifier_group'
import TenantBase from './tenant_base.js'

export default class ProductModifierOption extends TenantBase {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number

  @column()
  declare productModifierGroupId: number

  @column()
  declare modifierOptionId: number

  @column()
  declare priceAdjustment: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  @belongsTo(() => ProductModifierGroup)
  declare productModifierGroup: BelongsTo<typeof ProductModifierGroup>

  @belongsTo(() => ModifierOption)
  declare modifierOption: BelongsTo<typeof ModifierOption>
}
