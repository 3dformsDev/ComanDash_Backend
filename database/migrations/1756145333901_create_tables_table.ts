import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'tables'

  async up() {
    this.schema.createTable('tables', (table) => {
      table.increments('id').primary()
      table.integer('company_id').unsigned().references('id').inTable('companies').onDelete('CASCADE').notNullable()
      table.integer('location_id').unsigned().references('id').inTable('locations').onDelete('CASCADE').notNullable()
      table.string('number', 50).notNullable()
      table.integer('capacity').defaultTo(4)
      table.string('zone', 100).nullable()
      table.boolean('is_bussy').defaultTo(false)
      table.boolean('is_active').defaultTo(true)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.unique(['company_id', 'location_id', 'number'])

      // --- Índices adicionales para optimizar filtros ---
      // Optimiza la búsqueda de todas las mesas de una sucursal
      table.index('location_id', 'tables_location_id_index')
      // Optimiza el filtro por zona (ej: "Terraza", "Salón")
      table.index('zone', 'tables_zone_index')
      // Optimiza el filtro de mesas activas/inactivas
      table.index('is_active', 'tables_is_active_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}