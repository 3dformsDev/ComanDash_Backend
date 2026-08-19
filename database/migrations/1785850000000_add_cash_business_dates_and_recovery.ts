import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('cash_register_sessions', (table) => {
      table.date('business_date').nullable().after('status')
      table.integer('business_day_cutoff_hour').unsigned().nullable().after('business_date')
      table.timestamp('recovery_authorized_until').nullable().after('business_day_cutoff_hour')
      table
        .integer('recovery_authorized_by')
        .unsigned()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
        .nullable()
        .after('recovery_authorized_until')
      table.string('recovery_reason', 500).nullable().after('recovery_authorized_by')

      table.index(
        ['company_id', 'status', 'business_date'],
        'cash_sessions_company_status_business_date_idx',
      )
      table.index(
        ['company_id', 'recovery_authorized_until'],
        'cash_sessions_company_recovery_until_idx',
      )
    })

    this.schema.alterTable('orders', (table) => {
      table.date('business_date').nullable().after('cash_register_session_id')
      table.date('paid_business_date').nullable().after('paid_at')
      table.date('cancelled_business_date').nullable().after('cancelled_at')

      table.index(
        ['company_id', 'location_id', 'business_date'],
        'orders_company_location_business_date_idx',
      )
      table.index(
        ['company_id', 'location_id', 'paid_business_date'],
        'orders_company_location_paid_business_date_idx',
      )
      table.index(
        ['company_id', 'location_id', 'cancelled_business_date'],
        'orders_company_location_cancelled_business_date_idx',
      )
    })

    this.schema.alterTable('order_payments', (table) => {
      table.date('business_date').nullable().after('cash_register_session_id')
      table.index(
        ['cash_register_session_id', 'business_date'],
        'order_payments_session_business_date_idx',
      )
    })

    this.schema.alterTable('cash_movements', (table) => {
      table.date('business_date').nullable().after('cash_register_session_id')
      table.index(
        ['company_id', 'cash_register_session_id', 'business_date'],
        'cash_movements_company_session_business_date_idx',
      )
    })
  }

  async down() {
    this.schema.alterTable('cash_movements', (table) => {
      table.dropIndex(
        ['company_id', 'cash_register_session_id', 'business_date'],
        'cash_movements_company_session_business_date_idx',
      )
      table.dropColumn('business_date')
    })

    this.schema.alterTable('order_payments', (table) => {
      table.dropIndex(
        ['cash_register_session_id', 'business_date'],
        'order_payments_session_business_date_idx',
      )
      table.dropColumn('business_date')
    })

    this.schema.alterTable('orders', (table) => {
      table.dropIndex(
        ['company_id', 'location_id', 'cancelled_business_date'],
        'orders_company_location_cancelled_business_date_idx',
      )
      table.dropIndex(
        ['company_id', 'location_id', 'paid_business_date'],
        'orders_company_location_paid_business_date_idx',
      )
      table.dropIndex(
        ['company_id', 'location_id', 'business_date'],
        'orders_company_location_business_date_idx',
      )
      table.dropColumns('cancelled_business_date', 'paid_business_date', 'business_date')
    })

    this.schema.alterTable('cash_register_sessions', (table) => {
      table.dropIndex(
        ['company_id', 'recovery_authorized_until'],
        'cash_sessions_company_recovery_until_idx',
      )
      table.dropIndex(
        ['company_id', 'status', 'business_date'],
        'cash_sessions_company_status_business_date_idx',
      )
      table.dropForeign(['recovery_authorized_by'])
      table.dropColumns(
        'recovery_reason',
        'recovery_authorized_by',
        'recovery_authorized_until',
        'business_day_cutoff_hour',
        'business_date',
      )
    })
  }
}
