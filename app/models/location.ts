import { DateTime } from 'luxon'
import { column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import Company from './company.js'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import TenantBase from './tenant_base.js'
import CashRegister from './cash_register.js'
import Table from './table.js'

export default class Location extends TenantBase {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number

  @column()
  declare name: string

  @column()
  declare address?: string

  @column()
  declare phone?: string

  @column()
  declare isMain: boolean

  @column()
  declare isActive: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relación con la tabla companies
  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

   // Relaciones uno a muchos
   @hasMany(() => CashRegister)
   declare cashRegisters: HasMany<typeof CashRegister>
 
   @hasMany(() => Table)
   declare tables: HasMany<typeof Table>
}