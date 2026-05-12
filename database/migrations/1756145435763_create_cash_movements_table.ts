import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cash_movements'

  async up() {
    this.schema.createTable('cash_movements', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().references('id').inTable('companies').onDelete('CASCADE').notNullable()
      table.integer('cash_register_session_id').unsigned().references('id').inTable('cash_register_sessions').onDelete('CASCADE').notNullable()
      table.integer('order_id').unsigned().references('id').inTable('orders').onDelete('SET NULL').nullable()
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable()
      table.enum('movement_type', ['sale', 'withdrawal', 'deposit']).notNullable(),
      table.string('notes', 500).nullable(),
      table.decimal('amount', 10, 2).notNullable()
      table.string('description', 500).nullable()
      table.timestamp('created_at').defaultTo(this.now())

      // Nombre personalizado corto para el índice
      table.index(['cash_register_session_id', 'order_id', 'company_id', 'user_id'], 'idx_cash_movements_session_order_company')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}