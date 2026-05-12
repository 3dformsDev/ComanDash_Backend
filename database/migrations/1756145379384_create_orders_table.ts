import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'orders'

  async up() {
    this.schema.createTable('orders', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().references('id').inTable('companies').onDelete('CASCADE').notNullable()
      table.integer('cash_register_session_id').unsigned().references('id').inTable('cash_register_sessions').onDelete('CASCADE').notNullable()
      table.integer('location_id').unsigned().references('id').inTable('locations').onDelete('CASCADE').notNullable()
      table.string('order_number', 50).notNullable()
      table.integer('table_id').unsigned().references('id').inTable('tables').onDelete('SET NULL').nullable()
      table.string('customer_name', 255).nullable()
      table.integer('waiter_id').unsigned().references('id').inTable('users').onDelete('CASCADE').notNullable()
      table.text('kitchen_notes').nullable()
      table.enum('order_type', ['dine_in', 'takeaway']).notNullable()
      table.enum('status', ['pending', 'received', 'in_preparation', 'ready', 'served', 'paid', 'cancelled']).defaultTo('pending')
      table.boolean('is_advance_payment').defaultTo(false)
      table.boolean('is_ready_to_serve').defaultTo(false)
      table.boolean('is_served').defaultTo(false)
      table.boolean('is_prepaid').defaultTo(false)
      table.boolean('is_freed_table').defaultTo(false)
      table.decimal('subtotal', 10, 2).nullable()
      table.decimal('service_fee', 10, 2).defaultTo(0)
      table.decimal('tip_amount', 10, 2).defaultTo(0)
      table.decimal('total_amount', 10, 2).nullable()
      table.boolean('was_modified').defaultTo(false)
      table.timestamp('served_at').nullable()
      table.timestamp('paid_at').nullable()
      table.timestamp('cancelled_at').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.index(['cash_register_session_id', 'company_id', 'location_id', 'table_id', 'waiter_id', 'status'], 'idx_cash_movements_session_order_company')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}