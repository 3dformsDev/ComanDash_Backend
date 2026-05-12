import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import Company from './company.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Location from './location.js'

export default class DailySummary extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number

  @column()
  declare locationId: number

  @column.date()
  declare summaryDate: DateTime

  @column()
  declare totalOrders: number

  @column()
  declare totalRevenue: number

  @column()
  declare totalTips: number

  @column()
  declare dineInOrders: number

  @column()
  declare takeawayOrders: number

  @column()
  declare cancelledOrders: number

  @column()
  declare averageOrderValue: number

  @column()
  declare topSellingProducts?: Record<string, any>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relaciones
  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  @belongsTo(() => Location)
  declare location: BelongsTo<typeof Location>
}