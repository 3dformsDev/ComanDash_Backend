import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'order_status_histories'

  async up() {
    this.schema.createTable('order_status_history', (table) => {
      table.increments('id').primary()
      table.integer('order_id').unsigned().references('id').inTable('orders').onDelete('CASCADE').notNullable()
      table.string('previous_status', 50).nullable()
      table.string('new_status', 50).notNullable()
      table.integer('changed_by').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable()
      table.text('reason').nullable()
      table.timestamp('changed_at').defaultTo(this.now())

      // --- Índices para optimizar consultas ---
      table.index('order_id', 'order_status_history_order_id_index')
      table.index('changed_by', 'order_status_history_changed_by_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}