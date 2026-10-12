import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { cashRegisterSummary } from './cash_register_math.js'

export default class CashRegisterSummaryService {
  static async build(companyId: number, sessionId: number, openingBalance: number | string, trx?: TransactionClientContract) {
    const client = trx || db
    const movements = await client.from('cash_movements')
      .where('company_id', companyId).where('cash_register_session_id', sessionId)
      .select('movement_type', 'amount')
    // A cancelled sale retains both its receipt and its refund, possibly in different methods.
    const payments = await client.from('order_payments as p')
      .join('orders as o', 'o.id', 'p.order_id')
      .leftJoin('payment_methods as pm', (join) => {
        join.on('pm.id', '=', 'p.payment_method_id').andOn('pm.company_id', '=', 'o.company_id')
      })
      .where('o.company_id', companyId).where('p.cash_register_session_id', sessionId)
      .select('p.amount', 'pm.name')
    return cashRegisterSummary(openingBalance, movements, payments.map((payment) => ({
      amount: payment.amount, name: payment.name || 'Medio no disponible',
    })))
  }
}
