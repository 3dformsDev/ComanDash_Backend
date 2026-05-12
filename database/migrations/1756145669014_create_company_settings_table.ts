import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'company_settings'

  async up() {
    this.schema.createTable('company_settings', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().references('id').inTable('companies').onDelete('CASCADE').notNullable()
      table.string('setting_key', 100).notNullable()
      table.text('setting_value').nullable()
      table.enum('data_type', ['string', 'number', 'boolean', 'json']).defaultTo('string')
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
      
      table.unique(['company_id', 'setting_key'])
      table.index(['company_id']) // Índice para consultas frecuentes
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}