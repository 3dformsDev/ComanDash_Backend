import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'order_payments'

  async up() {
    this.schema.createTable('order_payments', (table) => {
      table.increments('id').primary()
      table.integer('order_id').unsigned().references('id').inTable('orders').onDelete('CASCADE').notNullable()
      table.integer('payment_method_id').unsigned().references('id').inTable('payment_methods').onDelete('CASCADE').notNullable()
      table.integer('cash_register_session_id').unsigned().references('id').inTable('cash_register_sessions').onDelete('SET NULL').nullable()
      table.decimal('amount', 10, 2).notNullable()
      table.string('reference_number', 100).nullable()
      table.integer('processed_by').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable()
      table.timestamp('processed_at').defaultTo(this.now())
      table.text('notes').nullable()

      // --- Índices para optimizar consultas ---
      table.index('order_id', 'order_payments_order_id_index')
      table.index('payment_method_id', 'order_payments_payment_method_id_index')
      table.index('cash_register_session_id', 'order_payments_session_id_index')
      table.index('processed_by', 'order_payments_processed_by_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}