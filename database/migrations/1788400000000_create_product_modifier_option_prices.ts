import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('product_modifier_options', (table) => {
      table.increments('id').primary()
      table
        .integer('company_id')
        .unsigned()
        .references('id')
        .inTable('companies')
        .onDelete('CASCADE')
        .notNullable()
      table
        .integer('product_modifier_group_id')
        .unsigned()
        .references('id')
        .inTable('product_modifier_groups')
        .onDelete('CASCADE')
        .notNullable()
      table
        .integer('modifier_option_id')
        .unsigned()
        .references('id')
        .inTable('modifier_options')
        .onDelete('RESTRICT')
        .notNullable()
      table.decimal('price_adjustment', 10, 2).notNullable().defaultTo(0)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.unique(
        ['company_id', 'product_modifier_group_id', 'modifier_option_id'],
        'prod_mod_options_assignment_option_uq',
      )
      table.index(
        ['company_id', 'product_modifier_group_id'],
        'prod_mod_options_company_assignment_idx',
      )
      table.index(['modifier_option_id'], 'prod_mod_options_option_idx')
    })
  }

  async down() {
    this.schema.dropTable('product_modifier_options')
  }
}
