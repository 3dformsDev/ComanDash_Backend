import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Role from './role.js'
import Functionality from './functionality.js'

export default class Permission extends BaseModel {
  static tableName = 'permissions'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare roleId: number

  @column()
  declare functionalityId: number

  @column()
  declare canAccess: boolean

  @column()
  declare canCreate: boolean

  @column()
  declare canRead: boolean

  @column()
  declare canUpdate: boolean

  @column()
  declare canDelete: boolean

  @column({
    prepare: (value: any) => JSON.stringify(value),
    consume: (value: string) => JSON.parse(value || 'null'),
  })
  declare restrictions: Record<string, any> | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /**
   * Relación con Role
   */
  @belongsTo(() => Role)
  declare role: BelongsTo<typeof Role>

  /**
   * Relación con Functionality
   */
  @belongsTo(() => Functionality)
  declare functionality: BelongsTo<typeof Functionality>

  /**
   * Verificar si tiene acceso a una acción específica
   */
  hasAccess(action: 'can_access' | 'can_create' | 'can_read' | 'can_update' | 'can_delete'): boolean {
    switch (action) {
      case 'can_access':
        return this.canAccess
      case 'can_create':
        return this.canCreate && this.canAccess
      case 'can_read':
        return this.canRead && this.canAccess
      case 'can_update':
        return this.canUpdate && this.canAccess
      case 'can_delete':
        return this.canDelete && this.canAccess
      default:
        return false
    }
  }

  /**
   * Obtener permisos de un rol específico
   */
  static async getByRole(roleId: number) {
    return await this.query()
      .where('role_id', roleId)
      .preload('functionality')
  }

  /**
   * Verificar si un rol tiene permisos para una funcionalidad específica
   */
  static async roleHasPermission(
    roleId: number,
    functionalityCode: string,
    action: 'can_access' | 'can_create' | 'can_read' | 'can_update' | 'can_delete' = 'can_access'
  ): Promise<boolean> {
    const permission = await this.query()
      .where('role_id', roleId)
      .whereHas('functionality', (builder) => {
        builder.where('code', functionalityCode).where('is_active', true)
      })
      .first()

    if (!permission) return false
    return permission.hasAccess(action)
  }
}