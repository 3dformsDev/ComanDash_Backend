import { Decimal } from 'decimal.js'

export interface CashEntry { movement_type: string; amount: number | string }
export interface PaymentEntry { name: string; amount: number | string }

/** Opening deposits are already represented by openingBalance. */
export function cashRegisterSummary(openingBalance: number | string, movements: CashEntry[], payments: PaymentEntry[]) {
  let received = new Decimal(0)
  let withdrawn = new Decimal(0)
  for (const movement of movements) {
    if (movement.movement_type === 'sale') received = received.plus(movement.amount)
    if (movement.movement_type === 'withdrawal') withdrawn = withdrawn.plus(movement.amount)
  }
  const methods = new Map<string, { received: Decimal; refunded: Decimal }>()
  for (const payment of payments) {
    const method = methods.get(payment.name) || { received: new Decimal(0), refunded: new Decimal(0) }
    const amount = new Decimal(payment.amount)
    if (amount.isPositive()) method.received = method.received.plus(amount)
    if (amount.isNegative()) method.refunded = method.refunded.minus(amount)
    methods.set(payment.name, method)
  }
  return {
    openingBalance: new Decimal(openingBalance).toNumber(),
    transactions: {
      totalSales: received.toNumber(),
      totalWithdrawals: withdrawn.toNumber(),
      netIncome: received.minus(withdrawn).toNumber(),
      incomeByPaymentMethod: [...methods].map(([name, method]) => ({
        name, received: method.received.toNumber(), refunded: method.refunded.toNumber(),
        total: method.received.minus(method.refunded).toNumber(),
      })),
    },
    expectedClosingBalance: new Decimal(openingBalance).plus(received).minus(withdrawn).toNumber(),
  }
}
