import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      const hasTableZones = await db.schema.hasTable('table_zones')

      if (!hasTableZones) {
        await db.schema.createTable('table_zones', (table) => {
          table.increments('id').primary()
          table
            .integer('company_id')
            .unsigned()
            .references('id')
            .inTable('companies')
            .onDelete('CASCADE')
            .notNullable()
          table
            .integer('location_id')
            .unsigned()
            .references('id')
            .inTable('locations')
            .onDelete('CASCADE')
            .notNullable()
          table.string('name', 100).collate('utf8mb4_unicode_ci').notNullable()
          table.string('icon_type', 30).notNullable().defaultTo('table')
          table.integer('display_order').unsigned().notNullable().defaultTo(0)
          table.boolean('is_active').notNullable().defaultTo(true)
          table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(db.knexRawQuery('CURRENT_TIMESTAMP'))
          table
            .timestamp('updated_at', { useTz: true })
            .notNullable()
            .defaultTo(db.knexRawQuery('CURRENT_TIMESTAMP'))

          table.unique(
            ['company_id', 'location_id', 'name'],
            'table_zones_company_location_name_uq',
          )
          table.index(
            ['company_id', 'location_id', 'is_active'],
            'table_zones_company_location_active_idx',
          )
          table.index(['location_id', 'display_order'], 'table_zones_location_order_idx')
        })
      }

      const hasZoneId = await db.schema.hasColumn('tables', 'zone_id')

      if (!hasZoneId) {
        await db.schema.alterTable('tables', (table) => {
          table
            .integer('zone_id')
            .unsigned()
            .references('id')
            .inTable('table_zones')
            .onDelete('SET NULL')
            .nullable()
          table.index(['company_id', 'location_id', 'zone_id'], 'tables_company_location_zone_idx')
        })
      }

      await db.rawQuery(`
        ALTER TABLE table_zones
        MODIFY name VARCHAR(100)
        CHARACTER SET utf8mb4
        COLLATE utf8mb4_unicode_ci
        NOT NULL
      `)

      await db.rawQuery(`
        INSERT INTO table_zones (
          company_id,
          location_id,
          name,
          icon_type,
          display_order,
          is_active,
          created_at,
          updated_at
        )
        SELECT DISTINCT
          tables.company_id,
          tables.location_id,
          CASE
            WHEN tables.zone IS NULL OR TRIM(tables.zone) = '' THEN 'Salón principal'
            ELSE TRIM(tables.zone)
          END AS zone_name,
          CASE
            WHEN LOWER(COALESCE(tables.zone, '')) LIKE '%barra%'
              OR LOWER(COALESCE(tables.zone, '')) LIKE '%bar%' THEN 'bar'
            WHEN LOWER(COALESCE(tables.zone, '')) LIKE '%terraza%'
              OR LOWER(COALESCE(tables.zone, '')) LIKE '%exterior%'
              OR LOWER(COALESCE(tables.zone, '')) LIKE '%patio%' THEN 'terrace'
            ELSE 'table'
          END AS icon_type,
          0,
          TRUE,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        FROM tables
        WHERE NOT EXISTS (
          SELECT 1
          FROM table_zones AS existing_zones
          WHERE existing_zones.company_id = tables.company_id
            AND existing_zones.location_id = tables.location_id
            AND existing_zones.name COLLATE utf8mb4_unicode_ci =
              (CASE
                WHEN tables.zone IS NULL OR TRIM(tables.zone) = '' THEN 'Salón principal'
                ELSE TRIM(tables.zone)
              END) COLLATE utf8mb4_unicode_ci
        )
      `)

      await db.rawQuery(`
        UPDATE tables
        INNER JOIN table_zones
          ON table_zones.company_id = tables.company_id
          AND table_zones.location_id = tables.location_id
          AND table_zones.name COLLATE utf8mb4_unicode_ci =
            (CASE
              WHEN tables.zone IS NULL OR TRIM(tables.zone) = '' THEN 'Salón principal'
              ELSE TRIM(tables.zone)
            END) COLLATE utf8mb4_unicode_ci
        SET
          tables.zone_id = table_zones.id,
          tables.zone = table_zones.name
      `)
    })
  }

  async down() {
    this.schema.alterTable('tables', (table) => {
      table.dropForeign(['zone_id'])
      table.dropIndex(['company_id', 'location_id', 'zone_id'], 'tables_company_location_zone_idx')
      table.dropColumn('zone_id')
    })

    this.schema.dropTable('table_zones')
  }
}
