import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'functionalities'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.string('name', 100).notNullable()
      table.string('description', 255).nullable()
      table.string('code', 50).notNullable().unique() // Código único global
      table.string('module', 50).notNullable() // Módulo al que pertenece (ventas, inventario, etc.)
      table.string('action', 50).notNullable() // Acción específica (create, read, update, delete, etc.)
      table.boolean('is_active').defaultTo(true)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      // Índices
      table.index(['module', 'action'])
      table.index(['is_active'])
      table.unique(['module', 'action', 'code'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}