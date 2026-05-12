import { DateTime } from 'luxon'
import { belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Company from './company.js'
import Location from './location.js'
import CashRegisterSession from './cash_registers_session.js'
import TenantBase from './tenant_base.js'

export default class CashRegister extends TenantBase {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number

  @column()
  declare locationId: number

  @column()
  declare name: string

  @column()
  declare initialBalance: number

  @column()
  declare isActive: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relaciones
  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  @belongsTo(() => Location)
  declare location: BelongsTo<typeof Location>

  @hasMany(() => CashRegisterSession)
  declare sessions: HasMany<typeof CashRegisterSession>
}