import { DateTime } from 'luxon'
import { belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Company from '#models/company'
import ModifierGroup from '#models/modifier_group'
import ModifierOption from '#models/modifier_option'
import OrderItem from '#models/order_item'
import TenantBase from './tenant_base.js'

export default class OrderItemModifierSelection extends TenantBase {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number

  @column()
  declare orderItemId: number

  @column()
  declare modifierGroupId: number | null

  @column()
  declare modifierOptionId: number | null

  @column()
  declare groupNameSnapshot: string

  @column()
  declare optionNameSnapshot: string

  @column()
  declare quantity: number

  @column()
  declare unitPriceAdjustment: number

  @column()
  declare totalPriceAdjustment: number

  @column()
  declare displayOrder: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  @belongsTo(() => OrderItem)
  declare orderItem: BelongsTo<typeof OrderItem>

  @belongsTo(() => ModifierGroup)
  declare modifierGroup: BelongsTo<typeof ModifierGroup>

  @belongsTo(() => ModifierOption)
  declare modifierOption: BelongsTo<typeof ModifierOption>
}
