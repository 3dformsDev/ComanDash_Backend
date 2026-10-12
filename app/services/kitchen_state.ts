/** Paid-before-preparation orders still need delivery; completed orders do not. */
export interface KitchenOrderState {
  status: string
  isServed?: boolean
  servedAt?: unknown
  isPrepaid?: boolean
  isAdvancePayment?: boolean
}

export function isKitchenOrderClosed(order: KitchenOrderState): boolean {
  return order.status === 'cancelled' || order.status === 'served' ||
    Boolean(order.isServed || order.servedAt) ||
    (order.status === 'paid' && !order.isPrepaid && !order.isAdvancePayment)
}

export class KitchenOperationError extends Error {
  constructor(public code: string, message: string, public status = 409) {
    super(message)
  }
}
