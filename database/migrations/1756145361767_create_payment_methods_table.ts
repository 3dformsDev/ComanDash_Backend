import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'payment_methods'

  async up() {
    this.schema.createTable('payment_methods', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().references('id').inTable('companies').onDelete('CASCADE').notNullable()
      table.string('name', 255).notNullable()
      table.enum('type', ['cash', 'card', 'digital', 'transfer', 'other']).notNullable()
      table.boolean('requires_reference').defaultTo(false)
      table.boolean('is_active').defaultTo(true)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.unique(['company_id', 'name'])

      // --- Índices adicionales para optimizar filtros ---
      table.index('type', 'payment_methods_type_index')
      table.index('is_active', 'payment_methods_is_active_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}