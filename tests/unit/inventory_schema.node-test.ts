import { test } from 'node:test'
import assert from 'node:assert/strict'
import knex from 'knex'
import InventoryMigration from '../../database/migrations/1788990000000_create_inventory_tables.js'

test('inventory schema compiles as additive MySQL DDL with no database connection', async () => {
  const sql = knex({ client: 'mysql2' })
  sql.client.acquireConnection = async () => { throw new Error('This test must never connect to a database') }
  try {
    const migration = new InventoryMigration(sql as unknown as ConstructorParameters<typeof InventoryMigration>[0], 'inventory-schema-offline', true)
    const queries = await migration.execUp()
    assert.ok(Array.isArray(queries))
    const ddl = queries.join('\n')
    assert.equal((ddl.match(/create table /g) || []).length, 7)
    assert.match(ddl, /alter table `orders` add `inventory_version`/)
    assert.match(ddl, /`inventory_line_key` varchar\(36\)/)
    assert.match(ddl, /`value_amount` decimal\(20, 6\)/)
    assert.match(ddl, /`created_at` datetime/)
    assert.match(ddl, /inventory_request_key_uq/)
    assert.match(ddl, /inventory_balance_scope_uq/)
    assert.doesNotMatch(ddl, /drop table|delete from|truncate /i)
    for (const query of queries) for (const match of query.matchAll(/(?:constraint|index|unique) `([^`]+)`/g)) assert.ok(match[1].length <= 64)
  } finally { await sql.destroy() }
})
