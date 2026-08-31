import { DateTime } from 'luxon'
import { belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Company from '#models/company'
import ModifierGroup from '#models/modifier_group'
import Product from '#models/product'
import TenantBase from './tenant_base.js'

export default class ProductModifierGroup extends TenantBase {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number

  @column()
  declare productId: number

  @column()
  declare modifierGroupId: number

  @column()
  declare minSelections: number

  @column()
  declare maxSelections: number

  @column()
  declare allowOptionQuantities: boolean

  @column()
  declare displayOrder: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  @belongsTo(() => Product)
  declare product: BelongsTo<typeof Product>

  @belongsTo(() => ModifierGroup)
  declare modifierGroup: BelongsTo<typeof ModifierGroup>
}
