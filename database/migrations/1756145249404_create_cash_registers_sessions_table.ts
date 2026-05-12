import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cash_registers_sessions'

  async up() {
    this.schema.createTable('cash_register_sessions', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().references('id').inTable('companies').onDelete('CASCADE').notNullable()
      table.integer('cash_register_id').unsigned().references('id').inTable('cash_registers').onDelete('CASCADE').notNullable()
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable()
      table.decimal('opening_balance', 10, 2).notNullable()
      table.decimal('closing_balance', 10, 2).nullable()
      table.decimal('real_closing_balance', 10, 2).nullable()
      table.decimal('difference_amount', 10, 2).nullable()
      table.enum('status', ['open', 'closed']).defaultTo('open')
      table.timestamp('opened_at').defaultTo(this.now())
      table.timestamp('closed_at').nullable()
      table.text('notes').nullable()

      table.index(['cash_register_id', 'user_id', 'company_id']) // Índices para consultas frecuentes
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}