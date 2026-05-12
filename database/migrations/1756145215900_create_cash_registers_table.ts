import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cash_registers'

  async up() {
    this.schema.createTable('cash_registers', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().references('id').inTable('companies').onDelete('CASCADE').notNullable()
      table.integer('location_id').unsigned().references('id').inTable('locations').onDelete('CASCADE').notNullable()
      table.string('name', 255).notNullable()
      table.decimal('initial_balance', 10, 2).notNullable().defaultTo(0)
      table.boolean('is_active').defaultTo(true)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.unique(['company_id', 'location_id', 'name'])
      table.index(['company_id', 'location_id']) // Índices para consultas frecuentes
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}