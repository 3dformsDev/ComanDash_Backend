import { DateTime } from 'luxon'
import { column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import CashRegister from './cash_register.js'
import User from './user.js'
import TenantBase from './tenant_base.js'

export default class CashRegisterSession extends TenantBase {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number

  @column()
  declare cashRegisterId: number

  @column()
  declare userId: number

  @column()
  declare openingBalance: number

  @column()
  declare closingBalance?: number

  @column()
  declare realClosingBalance?: number

  @column()
  declare differenceAmount?: number

  @column()
  declare status: 'open' | 'closed'

  @column.dateTime()
  declare openedAt: DateTime

  @column.dateTime()
  declare closedAt?: DateTime

  @column()
  declare notes?: string

  // Relaciones
  @belongsTo(() => CashRegister)
  declare cashRegister: BelongsTo<typeof CashRegister>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}