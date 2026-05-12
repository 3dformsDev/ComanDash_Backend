import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'companies'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.string('business_code', 20).notNullable().unique().comment('Código único del negocio')
      table.string('name', 255).notNullable()
      table.text('address').nullable()
      table.string('phone', 20).nullable()
      table.string('email', 100).nullable()
      table.string('logo_url', 500).nullable()
      table.enum('subscription_plan', ['basic', 'premium', 'enterprise']).defaultTo('basic')
      table.enum('subscription_status', ['active', 'suspended', 'cancelled']).defaultTo('active')
      table.timestamp('subscription_expires_at').nullable()
      table.integer('max_locations').defaultTo(1).comment('Máximo puntos de venta permitidos')
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}