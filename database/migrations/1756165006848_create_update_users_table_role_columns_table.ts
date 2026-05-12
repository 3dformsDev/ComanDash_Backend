import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Eliminar el campo role enum
      table.dropColumn('role')
      
      // Agregar el campo role_id como foreign key
      table.integer('role_id').unsigned().references('id').inTable('roles').onDelete('SET NULL').nullable()
      
      // Actualizar el índice
      table.dropIndex(['company_id', 'role'])
      table.index(['company_id', 'role_id'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      // Eliminar el campo role_id
      table.dropColumn('role_id')
      
      // Restaurar el campo role enum
      table.enum('role', ['super_admin','admin', 'manager', 'waiter', 'kitchen', 'cashier']).notNullable()
      
      // Restaurar el índice
      table.dropIndex(['company_id', 'role_id'])
      table.index(['company_id', 'role'])
    })
  }
}