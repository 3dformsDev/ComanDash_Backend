import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'activity_logs'

  async up() {
    this.schema.createTable('activity_logs', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().references('id').inTable('companies').onDelete('CASCADE').notNullable()
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable()
      table.string('action', 100).notNullable()
      table.string('resource_type', 50).nullable()
      table.integer('resource_id').nullable()
      table.jsonb('details').nullable()
      table.string('ip_address', 45).nullable()
      table.text('user_agent').nullable()
      table.timestamp('created_at').defaultTo(this.now())
      
      table.index(['company_id', 'user_id']) // Índices para consultas frecuentes
      table.index(['resource_type', 'resource_id']) // Índice para consultas por recurso
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}