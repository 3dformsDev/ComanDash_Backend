import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import Company from './company.js'
import User from './user.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class ActivityLog extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number

  @column()
  declare userId?: number

  @column()
  declare action: string

  @column()
  declare resourceType?: string

  @column()
  declare resourceId?: number

  @column()
  declare details?: Record<string, any>

  @column()
  declare ipAddress?: string

  @column()
  declare userAgent?: string

  @column.dateTime()
  declare createdAt: DateTime

  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}