import { DateTime } from 'luxon'
import { BaseModel, hasMany, column } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import Permission from './permission.js'

export default class Functionality extends BaseModel {
  static tableName = 'functionalities'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare description: string | null

  @column()
  declare code: string

  @column()
  declare module: string

  @column()
  declare action: string

  @column()
  declare isActive: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /**
   * Relación con Permissions
   */
  @hasMany(() => Permission)
  declare permissions: HasMany<typeof Permission>

  /**
   * Obtener funcionalidades por módulo
   */
  static async getByModule(module: string) {
    return await this.query()
      .where('module', module)
      .where('is_active', true)
      .orderBy('name')
  }

  /**
   * Obtener todas las funcionalidades agrupadas por módulo
   */
  static async getAllGroupedByModule() {
    const functionalities = await this.query()
      .where('is_active', true)
      .orderBy('module')
      .orderBy('name')

    // Agrupar por módulo
    const grouped: Record<string, Functionality[]> = {}
    
    functionalities.forEach((functionality) => {
      if (!grouped[functionality.module]) {
        grouped[functionality.module] = []
      }
      grouped[functionality.module].push(functionality)
    })

    return grouped
  }
}