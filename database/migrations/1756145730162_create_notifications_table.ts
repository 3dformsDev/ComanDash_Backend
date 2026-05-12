import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'notifications'

  async up() {
    this.schema.createTable('notifications', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().references('id').inTable('companies').onDelete('CASCADE').notNullable()
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE').nullable()
      table.string('title', 255).notNullable()
      table.text('message').notNullable()
      table.enum('type', ['info', 'warning', 'error', 'success']).defaultTo('info')
      table.string('action_url', 500).nullable()
      table.boolean('is_read').defaultTo(false)
      table.timestamp('expires_at').nullable()
      table.timestamp('created_at').defaultTo(this.now())

      table.index(['company_id', 'user_id']) // Índices para consultas frecuentes
      table.index(['expires_at']) // Índice para consultas por expiración
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}