export function blocksTableRecovery(order: { status: string; isServed: boolean }) {
  return order.status !== 'cancelled' && !(order.status === 'paid' && order.isServed)
}
