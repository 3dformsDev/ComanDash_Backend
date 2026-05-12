import { DateTime } from 'luxon'
import { BaseModel, belongsTo, hasMany, column } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Company from './company.js'
import User from './user.js'
import Permission from './permission.js'

export default class Role extends BaseModel {
  static tableName = 'roles'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number

  @column()
  declare name: string

  @column()
  declare description: string | null

  @column()
  declare code: string

  @column()
  declare isActive: boolean

  @column()
  declare isDefault: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /**
   * Relación con Company
   */
  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  /**
   * Relación con Users
   */
  @hasMany(() => User)
  declare users: HasMany<typeof User>

  /**
   * Relación con Permissions
   */
  @hasMany(() => Permission)
  declare permissions: HasMany<typeof Permission>

  /**
   * Obtener permisos del rol con funcionalidades
   */
  async getPermissionsWithFunctionalities() {
    return await Permission.query()
      .where('role_id', this.id)
      .preload('functionality')
  }

  /**
   * Verificar si el rol tiene una funcionalidad específica
   */
  async hasPermission(functionalityCode: string, action: 'access' | 'create' | 'read' | 'update' | 'delete' = 'access'): Promise<boolean> {
    const permission = await Permission.query()
      .where('role_id', this.id)
      .whereHas('functionality', (builder) => {
        builder.where('code', functionalityCode)
      })
      .first()

    if (!permission) return false

    switch (action) {
      case 'access':
        return permission.canAccess
      case 'create':
        return permission.canCreate
      case 'read':
        return permission.canRead
      case 'update':
        return permission.canUpdate
      case 'delete':
        return permission.canDelete
      default:
        return false
    }
  }
}