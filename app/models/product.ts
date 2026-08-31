import { DateTime } from 'luxon'
import { column, belongsTo, hasMany, computed } from '@adonisjs/lucid/orm'
import Company from '#models/company'
import Category from '#models/category'
import OrderItem from '#models/order_item'
import ProductModifierGroup from '#models/product_modifier_group'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import TenantBase from './tenant_base.js'
import { Decimal } from 'decimal.js'
import env from '#start/env'

export default class Product extends TenantBase {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number

  @column()
  declare categoryId: number

  @column()
  declare name: string

  @column()
  declare description: string | null

  @column()
  declare price: number

  @column()
  declare cost: number | null

  @column()
  declare imageUrl: string | null

  @column()
  declare sku: string | null

  @column()
  declare isAvailable: boolean

  @column()
  declare isActive: boolean

  @column()
  declare preparationTime: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /**
   * RELACIONES
   */
  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  @belongsTo(() => Category)
  declare category: BelongsTo<typeof Category>

  @hasMany(() => OrderItem)
  declare orderItems: HasMany<typeof OrderItem>

  @hasMany(() => ProductModifierGroup)
  declare modifierGroupAssignments: HasMany<typeof ProductModifierGroup>

  /**
   * MÉTODOS HELPER PARA CÁLCULOS
   */
  getPriceAsDecimal(): Decimal {
    return new Decimal(this.price || 0)
  }

  getCostAsDecimal(): Decimal {
    return new Decimal(this.cost || 0)
  }

  getProfit(): Decimal {
    return this.getPriceAsDecimal().minus(this.getCostAsDecimal())
  }

  getProfitMargin(): Decimal {
    const price = this.getPriceAsDecimal()
    if (price.isZero()) return new Decimal(0)
    return this.getProfit().div(price).mul(100)
  }

  @computed()
  public get protectedImageUrl() {
    if (!this.imageUrl) return null
    return `${env.get('APP_URL')}/api/v1/products/${this.id}/image`
  }

  @computed()
  public get hasPersonalizations() {
    return Array.isArray(this.modifierGroupAssignments) && this.modifierGroupAssignments.length > 0
  }

  // @beforeFetch()
  // static autoLoadRelations(query: ModelQueryBuilderContract<typeof Product>) {
  //   // Cargar automáticamente company, role y location en TODAS las consultas
  //   query.preload('category')
  // }
}
