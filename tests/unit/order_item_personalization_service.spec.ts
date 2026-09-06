import { test } from '@japa/runner'
import OrderItemPersonalizationService from '#services/orders/order_item_personalization_service'

test.group('Order item personalization totals', () => {
  test('adds selected option values before multiplying the product quantity', ({ assert }) => {
    const service = new OrderItemPersonalizationService()
    const selections = [
      { quantity: 1, unitPriceAdjustment: 3000 },
      { quantity: 2, unitPriceAdjustment: 1000 },
    ] as any

    const total = service.calculateLineTotal(20000, 2, selections)

    assert.equal(total.toNumber(), 50000)
  })

  test('keeps free options from changing the product total', ({ assert }) => {
    const service = new OrderItemPersonalizationService()
    const selections = [
      { quantity: 3, unitPriceAdjustment: 0 },
    ] as any

    const total = service.calculatePersistedLineTotal(15000, 2, selections)

    assert.equal(total.toNumber(), 30000)
  })
})
