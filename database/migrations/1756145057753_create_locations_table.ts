import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'locations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().references('id').inTable('companies').onDelete('CASCADE').notNullable()
      table.string('name', 255).notNullable()
      table.text('address').nullable()
      table.string('phone', 20).nullable()
      table.boolean('is_main').defaultTo(false)
      table.boolean('is_active').defaultTo(true)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.unique(['company_id', 'name'])
      table.index(['company_id']) // Índice explícito para consultas rápidas por company_id
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}