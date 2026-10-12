import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('orders', (t) => t.integer('inventory_version').unsigned().notNullable().defaultTo(0))
    this.schema.alterTable('order_items', (t) => {
      t.string('inventory_line_key', 36).nullable().index()
      t.json('inventory_composition').nullable()
    })
    this.schema.createTable('inventory_balances', (t) => {
      t.increments('id')
      // Mutable current state follows the deletion behavior already used by the
      // owning records. Historical operations below keep their own snapshots.
      t.integer('company_id').unsigned().notNullable().references('id').inTable('companies').onDelete('CASCADE')
      t.integer('location_id').unsigned().notNullable().references('id').inTable('locations').onDelete('CASCADE')
      t.integer('product_id').unsigned().notNullable().references('id').inTable('products').onDelete('CASCADE')
      t.boolean('enabled').notNullable().defaultTo(false)
      t.integer('quantity').notNullable().defaultTo(0)
      t.integer('minimum_quantity').unsigned().notNullable().defaultTo(0)
      t.decimal('carrying_value', 20, 6).notNullable().defaultTo(0)
      t.integer('version').unsigned().notNullable().defaultTo(0)
      t.integer('control_epoch').unsigned().notNullable().defaultTo(0)
      t.dateTime('updated_at').notNullable()
      t.unique(['company_id', 'location_id', 'product_id'], 'inventory_balance_scope_uq')
    })
    this.schema.createTable('inventory_operations', (t) => {
      t.increments('id')
      t.integer('company_id').unsigned().notNullable()
      t.integer('location_id').unsigned().notNullable()
      t.integer('actor_id').unsigned().notNullable()
      t.string('actor_name', 255).notNullable()
      t.string('actor_role', 80).notNullable()
      t.string('type', 40).notNullable()
      t.integer('order_id').unsigned().nullable()
      t.string('order_number', 80).nullable()
      t.text('reason').nullable()
      t.json('details').nullable()
      t.string('supplier', 255).nullable()
      t.string('reference', 255).nullable()
      t.date('business_date').nullable()
      t.dateTime('created_at').notNullable()
      t.index(['company_id', 'location_id', 'created_at', 'id'], 'inventory_operations_scope_date_idx')
      t.index(['company_id', 'order_id'])
    })
    this.schema.createTable('inventory_movements', (t) => {
      t.increments('id')
      t.integer('operation_id').unsigned().notNullable().references('id').inTable('inventory_operations').onDelete('RESTRICT')
      t.integer('company_id').unsigned().notNullable()
      t.integer('location_id').unsigned().notNullable()
      t.integer('product_id').unsigned().notNullable()
      t.string('product_name', 255).notNullable()
      t.integer('quantity').notNullable()
      t.integer('quantity_before').notNullable()
      t.integer('quantity_after').notNullable()
      t.decimal('value_delta', 20, 6).notNullable()
      t.integer('control_epoch').unsigned().notNullable()
      t.dateTime('created_at').notNullable()
      t.index(['company_id', 'location_id', 'product_id', 'id'], 'inventory_movement_product_idx')
    })
    this.schema.createTable('inventory_order_consumptions', (t) => {
      t.increments('id')
      t.integer('company_id').unsigned().notNullable()
      t.integer('location_id').unsigned().notNullable()
      t.integer('order_id').unsigned().notNullable()
      t.string('line_key', 36).notNullable()
      t.integer('product_id').unsigned().notNullable()
      t.string('product_name', 255).notNullable()
      t.integer('quantity').unsigned().notNullable()
      // A cache of immutable return details, changed only under the order lock.
      t.integer('resolved_quantity').unsigned().notNullable().defaultTo(0)
      t.decimal('unit_cost', 20, 6).notNullable()
      t.decimal('value_amount', 20, 6).notNullable()
      t.decimal('resolved_value', 20, 6).notNullable().defaultTo(0)
      t.integer('movement_id').unsigned().notNullable().references('id').inTable('inventory_movements').onDelete('RESTRICT')
      t.json('composition_snapshot').notNullable()
      t.index(['company_id', 'location_id', 'order_id', 'id'], 'inventory_consumption_order_idx')
    })
    this.schema.createTable('inventory_return_details', (t) => {
      t.increments('id')
      t.integer('operation_id').unsigned().notNullable().references('id').inTable('inventory_operations').onDelete('RESTRICT')
      t.integer('consumption_id').unsigned().notNullable().references('id').inTable('inventory_order_consumptions').onDelete('RESTRICT')
      t.integer('removed_quantity').unsigned().notNullable()
      t.integer('recovered_quantity').unsigned().notNullable()
      t.integer('not_recovered_quantity').unsigned().notNullable()
      t.decimal('recovered_value', 20, 6).notNullable()
      t.text('reason').nullable()
      t.boolean('applied_to_stock').notNullable()
      t.unique(['operation_id', 'consumption_id'], 'inventory_return_operation_source_uq')
    })
    this.schema.createTable('product_option_inventory_components', (t) => {
      t.increments('id')
      t.integer('company_id').unsigned().notNullable()
      t.integer('product_id').unsigned().notNullable().references('id').inTable('products').onDelete('CASCADE')
      t.integer('modifier_group_id').unsigned().notNullable().references('id').inTable('modifier_groups').onDelete('CASCADE')
      t.integer('modifier_option_id').unsigned().notNullable().references('id').inTable('modifier_options').onDelete('CASCADE')
      t.integer('component_product_id').unsigned().notNullable().references('id').inTable('products').onDelete('CASCADE')
      t.integer('units').unsigned().notNullable()
      t.unique(['company_id', 'product_id', 'modifier_option_id', 'component_product_id'], 'inventory_option_component_uq')
    })
    this.schema.createTable('inventory_mutation_requests', (t) => {
      t.increments('id')
      t.integer('company_id').unsigned().notNullable()
      t.integer('location_id').unsigned().notNullable()
      t.integer('actor_id').unsigned().notNullable()
      t.string('request_key', 100).notNullable()
      t.string('fingerprint', 64).notNullable()
      t.json('result').nullable()
      t.dateTime('created_at').notNullable()
      t.unique(['company_id', 'location_id', 'actor_id', 'request_key'], 'inventory_request_key_uq')
    })
  }

  async down() {
    // Never run down after real inventory activity: preserve its audit trail.
    for (const name of ['inventory_return_details', 'inventory_order_consumptions', 'inventory_movements',
      'inventory_operations', 'product_option_inventory_components', 'inventory_mutation_requests', 'inventory_balances']) {
      this.schema.dropTable(name)
    }
    this.schema.alterTable('order_items', (t) => {
      t.dropColumn('inventory_composition')
      t.dropColumn('inventory_line_key')
    })
    this.schema.alterTable('orders', (t) => t.dropColumn('inventory_version'))
  }
}
