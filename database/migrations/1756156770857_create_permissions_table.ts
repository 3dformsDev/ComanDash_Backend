import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'permissions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.integer('role_id').unsigned().references('id').inTable('roles').onDelete('CASCADE').notNullable()
      table.integer('functionality_id').unsigned().references('id').inTable('functionalities').onDelete('CASCADE').notNullable()
      table.boolean('can_access').defaultTo(true) // Puede acceder a la funcionalidad
      table.boolean('can_create').defaultTo(false) // Puede crear
      table.boolean('can_read').defaultTo(true) // Puede leer
      table.boolean('can_update').defaultTo(false) // Puede actualizar
      table.boolean('can_delete').defaultTo(false) // Puede eliminar
      table.json('restrictions').nullable() // Restricciones adicionales (JSON)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      // Índices y restricciones
      table.unique(['role_id', 'functionality_id'])
      table.index(['role_id'])
      table.index(['functionality_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}