import test from 'node:test'
import assert from 'node:assert/strict'
import { cashRegisterSummary } from '../../app/services/cash_register_math.js'

test('cash close preserves a Nequi sale refunded in cash and does not count opening twice', () => {
  const result = cashRegisterSummary(2000, [
    { movement_type: 'deposit', amount: 2000 },
    { movement_type: 'sale', amount: 272000 },
    { movement_type: 'withdrawal', amount: 50000 },
  ], [
    { name: 'Efectivo', amount: 207000 }, { name: 'Efectivo', amount: -50000 },
    { name: 'Nequi', amount: 50000 }, { name: 'Daviplata', amount: 15000 },
  ])
  assert.equal(result.expectedClosingBalance, 224000)
  assert.equal(result.transactions.totalSales, 272000)
  assert.equal(result.transactions.netIncome, 222000)
  assert.equal(result.transactions.incomeByPaymentMethod.find((p) => p.name === 'Efectivo')?.total, 157000)
  assert.equal(result.transactions.incomeByPaymentMethod.reduce((sum, p) => sum + p.total, 0), 222000)
})

test('unpaid cancellations and split receipts do not invent withdrawals', () => {
  const result = cashRegisterSummary('1000.00', [
    { movement_type: 'sale', amount: '100.10' }, { movement_type: 'sale', amount: '200.20' },
  ], [{ name: 'Efectivo', amount: '100.10' }, { name: 'Nequi', amount: '200.20' }])
  assert.equal(result.transactions.totalSales, 300.3)
  assert.equal(result.transactions.totalWithdrawals, 0)
  assert.equal(result.expectedClosingBalance, 1300.3)
})

test('partial refunds and manual withdrawals are applied once to the ledger balance', () => {
  const result = cashRegisterSummary(1000, [
    { movement_type: 'sale', amount: 10000 },
    { movement_type: 'withdrawal', amount: 3000 }, { movement_type: 'withdrawal', amount: 500 },
  ], [{ name: 'Efectivo', amount: 10000 }, { name: 'Efectivo', amount: -3000 }])
  assert.equal(result.expectedClosingBalance, 7500)
  assert.equal(result.transactions.incomeByPaymentMethod[0].total, 7000)
})
