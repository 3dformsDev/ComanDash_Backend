import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import Company from './company.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class CompanySetting extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number

  @column()
  declare settingKey: string

  @column()
  declare settingValue?: string

  @column()
  declare dataType: 'string' | 'number' | 'boolean' | 'json'

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relaciones
  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  // Método para parsear settingValue según dataType
  getParsedValue() {
    if (!this.settingValue) return null
    switch (this.dataType) {
      case 'string':
        return this.settingValue
      case 'number':
        return parseFloat(this.settingValue)
      case 'boolean':
        return this.settingValue === 'true'
      case 'json':
        return JSON.parse(this.settingValue)
      default:
        return this.settingValue
    }
  }

  // Método para establecer settingValue con validación
  setParsedValue(value: any) {
    switch (this.dataType) {
      case 'string':
        this.settingValue = String(value)
        break
      case 'number':
        if (isNaN(value)) throw new Error('El valor debe ser un número')
        this.settingValue = String(value)
        break
      case 'boolean':
        this.settingValue = String(!!value)
        break
      case 'json':
        this.settingValue = JSON.stringify(value)
        break
      default:
        throw new Error('Tipo de dato no válido')
    }
  }
}