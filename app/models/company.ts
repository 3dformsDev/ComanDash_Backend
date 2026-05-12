import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import Location from './location.js'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import Order from './order.js'
import CashRegister from './cash_register.js'
import ActivityLog from './activity_log.js'
import Category from './category.js'
import CompanySetting from './company_setting.js'
import DailySummary from './daily_summary.js'
import Notification from './notification.js'

export default class Company extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare businessCode: string

  @column()
  declare name: string

  @column()
  declare address?: string

  @column()
  declare phone?: string
  @column()
  declare email?: string

  @column()
  declare logoUrl?: string

  @column()
  declare subscriptionPlan: 'basic' | 'premium' | 'enterprise'

  @column()
  declare subscriptionStatus: 'active' | 'suspended' | 'cancelled'

  @column.dateTime()
  declare subscriptionExpiresAt?: DateTime

  @column()
  declare maxLocations: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relaciones
  @hasMany(() => Location)
  declare locations: HasMany<typeof Location>

  @hasMany(() => User)
  declare users: HasMany<typeof User>

  @hasMany(() => Order)
  declare orders: HasMany<typeof Order>

  @hasMany(() => CashRegister)
  declare cashRegisters: HasMany<typeof CashRegister>

  @hasMany(() => ActivityLog)
  declare activityLogs: HasMany<typeof ActivityLog>

  @hasMany(() => Category)
  declare categories: HasMany<typeof Category>

  @hasMany(() => CompanySetting)
  declare settings: HasMany<typeof CompanySetting>

  @hasMany(() => DailySummary)
  declare dailySummaries: HasMany<typeof DailySummary>

  @hasMany(() => Notification)
  declare notifications: HasMany<typeof Notification>
}
