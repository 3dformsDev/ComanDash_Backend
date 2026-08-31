import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('modifier_groups', (table) => {
      table.increments('id').primary()
      table
        .integer('company_id')
        .unsigned()
        .references('id')
        .inTable('companies')
        .onDelete('CASCADE')
        .notNullable()
      table.string('name', 150).notNullable()
      table.string('description', 500).nullable()
      table.integer('display_order').unsigned().notNullable().defaultTo(0)
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.unique(['company_id', 'name'], 'mod_groups_company_name_uq')
      table.index(['company_id', 'is_active'], 'mod_groups_company_active_idx')
      table.index(['company_id', 'display_order'], 'mod_groups_company_order_idx')
    })

    this.schema.createTable('modifier_options', (table) => {
      table.increments('id').primary()
      table
        .integer('company_id')
        .unsigned()
        .references('id')
        .inTable('companies')
        .onDelete('CASCADE')
        .notNullable()
      table
        .integer('modifier_group_id')
        .unsigned()
        .references('id')
        .inTable('modifier_groups')
        .onDelete('RESTRICT')
        .notNullable()
      table.string('name', 150).notNullable()
      table.decimal('price_adjustment', 10, 2).notNullable().defaultTo(0)
      table.integer('display_order').unsigned().notNullable().defaultTo(0)
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.unique(
        ['company_id', 'modifier_group_id', 'name'],
        'mod_options_company_group_name_uq',
      )
      table.index(
        ['company_id', 'modifier_group_id', 'is_active'],
        'mod_options_company_group_active_idx',
      )
      table.index(
        ['modifier_group_id', 'display_order'],
        'mod_options_group_order_idx',
      )
    })

    this.schema.createTable('product_modifier_groups', (table) => {
      table.increments('id').primary()
      table
        .integer('company_id')
        .unsigned()
        .references('id')
        .inTable('companies')
        .onDelete('CASCADE')
        .notNullable()
      table
        .integer('product_id')
        .unsigned()
        .references('id')
        .inTable('products')
        .onDelete('CASCADE')
        .notNullable()
      table
        .integer('modifier_group_id')
        .unsigned()
        .references('id')
        .inTable('modifier_groups')
        .onDelete('RESTRICT')
        .notNullable()
      table.integer('min_selections').unsigned().notNullable().defaultTo(0)
      table.integer('max_selections').unsigned().notNullable().defaultTo(1)
      table.boolean('allow_option_quantities').notNullable().defaultTo(false)
      table.integer('display_order').unsigned().notNullable().defaultTo(0)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.unique(
        ['company_id', 'product_id', 'modifier_group_id'],
        'prod_mod_groups_product_group_uq',
      )
      table.index(['company_id', 'product_id'], 'prod_mod_groups_company_product_idx')
      table.index(
        ['company_id', 'modifier_group_id'],
        'prod_mod_groups_company_group_idx',
      )
      table.index(['product_id', 'display_order'], 'prod_mod_groups_product_order_idx')
    })

    this.schema.createTable('order_item_modifier_selections', (table) => {
      table.increments('id').primary()
      table
        .integer('company_id')
        .unsigned()
        .references('id')
        .inTable('companies')
        .onDelete('CASCADE')
        .notNullable()
      table
        .integer('order_item_id')
        .unsigned()
        .references('id')
        .inTable('order_items')
        .onDelete('CASCADE')
        .notNullable()
      table
        .integer('modifier_group_id')
        .unsigned()
        .references('id')
        .inTable('modifier_groups')
        .onDelete('SET NULL')
        .nullable()
      table
        .integer('modifier_option_id')
        .unsigned()
        .references('id')
        .inTable('modifier_options')
        .onDelete('SET NULL')
        .nullable()
      table.string('group_name_snapshot', 150).notNullable()
      table.string('option_name_snapshot', 150).notNullable()
      table.integer('quantity').unsigned().notNullable().defaultTo(1)
      table.decimal('unit_price_adjustment', 10, 2).notNullable().defaultTo(0)
      table.decimal('total_price_adjustment', 10, 2).notNullable().defaultTo(0)
      table.integer('display_order').unsigned().notNullable().defaultTo(0)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.index(['company_id', 'order_item_id'], 'item_mod_sel_company_item_idx')
      table.index(['modifier_group_id'], 'item_mod_sel_group_idx')
      table.index(['modifier_option_id'], 'item_mod_sel_option_idx')
    })
  }

  async down() {
    this.schema.dropTable('order_item_modifier_selections')
    this.schema.dropTable('product_modifier_groups')
    this.schema.dropTable('modifier_options')
    this.schema.dropTable('modifier_groups')
  }
}
