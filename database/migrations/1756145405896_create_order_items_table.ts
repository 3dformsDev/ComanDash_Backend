import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'order_items'

  async up() {
    this.schema.createTable('order_items', (table) => {
      table.increments('id').primary()
      table.integer('order_id').unsigned().references('id').inTable('orders').onDelete('CASCADE').notNullable()
      table.integer('product_id').unsigned().references('id').inTable('products').onDelete('CASCADE').notNullable()
      table.integer('quantity').notNullable().defaultTo(1)
      table.decimal('unit_price', 10, 2).notNullable()
      table.decimal('total_price', 10, 2).notNullable()
      table.text('special_instructions').nullable()
      table.enum('kitchen_status', ['pending', 'in_preparation', 'ready', 'served']).defaultTo('pending')
      table.timestamp('kitchen_started_at').nullable()
      table.timestamp('kitchen_ready_at').nullable()
      table.timestamp('served_at').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.index('order_id', 'order_items_order_id_index')
      table.index('product_id', 'order_items_product_id_index')
      table.index('kitchen_status', 'order_items_kitchen_status_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}