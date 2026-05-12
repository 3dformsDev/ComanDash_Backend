import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'roles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().references('id').inTable('companies').onDelete('CASCADE').notNullable()
      table.string('name', 100).notNullable()
      table.string('description', 255).nullable()
      table.string('code', 50).notNullable() // Para identificación programática
      table.boolean('is_active').defaultTo(true)
      table.boolean('is_default').defaultTo(false) // Para rol por defecto
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      // Índices y restricciones
      table.unique(['company_id', 'name'])
      table.unique(['company_id', 'code'])
      table.index(['company_id', 'is_active'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}