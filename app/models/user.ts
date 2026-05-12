import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, belongsTo, hasMany, beforeFetch } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Company from './company.js'
import Location from './location.js'
import Order from './order.js'
import CashRegisterSession from './cash_registers_session.js'
import ActivityLog from './activity_log.js'
import Notification from './notification.js'
import Role from './role.js'
import Permission from './permission.js'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email', 'username'],
  passwordColumnName: 'password',
})

export default class User extends compose(BaseModel, AuthFinder) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number

  @column()
  declare locationId?: number // Opcional, ya que es nullable

  @column()
  declare username: string

  @column()
  declare email?: string // Opcional, ya que es nullable

  @column({ serializeAs: null })
  declare password: string

  @column()
  declare fullName: string

  @column()
  declare roleId: number

  @column()
  declare isActive: boolean

  @column.dateTime()
  declare lastLoginAt?: DateTime // Opcional, ya que es nullable

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relaciones
  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  @belongsTo(() => Location)
  declare location: BelongsTo<typeof Location>

  @hasMany(() => Order, { foreignKey: 'waiterId' })
  declare orders: HasMany<typeof Order>

  @hasMany(() => CashRegisterSession)
  declare cashRegisterSessions: HasMany<typeof CashRegisterSession>

  @hasMany(() => ActivityLog)
  declare activityLogs: HasMany<typeof ActivityLog>

  @hasMany(() => Notification)
  declare notifications: HasMany<typeof Notification>

  /**
   * Relación con Role
   */
  @belongsTo(() => Role)
  declare role: BelongsTo<typeof Role>

  /**
   * Verificar si el usuario tiene un permiso específico
   */
  async hasPermission(functionalityCode: string, action: 'can_access' | 'can_create' | 'can_read' | 'can_update' | 'can_delete' = 'can_access'): Promise<boolean> {
    return await Permission.roleHasPermission(this.roleId, functionalityCode, action)
  }

  /**
   * Obtener todos los permisos del usuario
   */
  async getPermissions() {
    return await Permission.getByRole(this.roleId)
  }

  static accessTokens = DbAccessTokensProvider.forModel(User)


  @beforeFetch()
  static autoLoadRelations(query: ModelQueryBuilderContract<typeof User>) {
    // Cargar automáticamente company, role y location en TODAS las consultas
    query.preload('company')
    query.preload('role')
  }
}