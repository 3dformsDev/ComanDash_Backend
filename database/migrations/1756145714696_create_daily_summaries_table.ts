import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'daily_summaries'

  async up() {
    this.schema.createTable('daily_summaries', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().references('id').inTable('companies').onDelete('CASCADE').notNullable()
      table.integer('location_id').unsigned().references('id').inTable('locations').onDelete('CASCADE').notNullable()
      table.date('summary_date').notNullable()
      table.integer('total_orders').defaultTo(0)
      table.decimal('total_revenue', 12, 2).defaultTo(0)
      table.decimal('total_tips', 10, 2).defaultTo(0)
      table.integer('dine_in_orders').defaultTo(0)
      table.integer('takeaway_orders').defaultTo(0)
      table.integer('cancelled_orders').defaultTo(0)
      table.decimal('average_order_value', 10, 2).defaultTo(0)
      table.jsonb('top_selling_products').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.unique(['company_id', 'location_id', 'summary_date'])
      table.index(['company_id', 'location_id']) // Índice para consultas frecuentes
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}