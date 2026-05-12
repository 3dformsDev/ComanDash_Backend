import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().references('id').inTable('companies').onDelete('CASCADE').notNullable()
      table.integer('location_id').unsigned().references('id').inTable('locations').onDelete('SET NULL').nullable()
      table.string('username', 100).notNullable()
      table.string('email', 100).nullable()
      table.string('password', 255).notNullable()
      table.string('full_name', 255).notNullable()
      table.enum('role', ['super_admin','admin', 'manager', 'waiter', 'kitchen', 'cashier']).notNullable()
      table.boolean('is_active').defaultTo(true)
      table.timestamp('last_login_at').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.unique(['company_id', 'username'])
      table.unique(['company_id', 'email'])
      table.index(['company_id', 'location_id'])
      table.index(['company_id', 'role'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}