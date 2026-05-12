import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'products'

  async up() {
    this.schema.createTable('products', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().references('id').inTable('companies').onDelete('CASCADE').notNullable()
      table.integer('category_id').unsigned().references('id').inTable('categories').onDelete('CASCADE').notNullable()
      table.string('name', 255).notNullable()
      table.text('description').nullable()
      table.decimal('price', 10, 2).notNullable()
      table.decimal('cost', 10, 2).nullable()
      table.string('image_url', 500).nullable()
      table.string('sku', 100).nullable()
      table.boolean('is_available').defaultTo(true)
      table.boolean('is_active').defaultTo(true)
      table.integer('preparation_time').nullable().comment('En minutos')
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      // table.unique(['company_id', 'name'])
      table.unique(['company_id', 'sku'])

      // --- Índices adicionales para optimizar filtros comunes ---
      table.index('category_id', 'products_category_id_index')
      table.index('is_available', 'products_is_available_index')
      table.index('is_active', 'products_is_active_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}