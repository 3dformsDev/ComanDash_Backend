import { test } from 'node:test'
import assert from 'node:assert/strict'
import { demand, InventoryError, money, reductions, returnQuantity, returnValue, units, valuation } from '../../app/services/inventory/inventory_math.js'

test('whole units reject fractions, strings, negatives and overflow', () => {
  for (const invalid of [0.5, '3', -1, NaN, Infinity, null, 1000000001]) assert.throws(() => units(invalid), InventoryError)
  assert.equal(units(0), 0)
  assert.equal(units(48), 48)
})
test('zero is a valid stated cost; unknown costs are rejected', () => {
  assert.equal(money(0).toFixed(2), '0.00')
  for (const invalid of ['', null, undefined, -1, Infinity, 'bad', true]) assert.throws(() => money(invalid), InventoryError)
})
test('two six-soda combos plus a direct soda demand thirteen from the same balance', () => {
  const combo = demand([{ productId: 10, name: 'Gaseosa', units: 6, origin: 'option:4' }], 2)
  const direct = demand([{ productId: 10, name: 'Gaseosa', units: 1, origin: 'product' }], 1)
  assert.equal(combo.get(10)! + direct.get(10)!, 13)
  assert.throws(() => valuation(12, '12000', -13), /Solo quedan 12/)
})
test('direct and option demand is aggregated inside a line', () => {
  const result = demand([{ productId: 10, name: 'Soda', units: 1, origin: 'product' },
    { productId: 10, name: 'Soda', units: 6, origin: 'option:1' }, { productId: 11, name: 'Agua', units: 2, origin: 'option:2' }], 2)
  assert.deepEqual([...result], [[10, 14], [11, 4]])
})
test('weighted valuation includes free receipts and zeros out on exhaustion', () => {
  const received = valuation(10, '100', 10, '0')
  assert.equal(received.quantity, 20); assert.equal(received.value, '100.000000')
  const sold = valuation(received.quantity, received.value, -3)
  assert.equal(sold.unitCost, '5.000000'); assert.equal(sold.value, '85.000000')
  assert.equal(valuation(17, sold.value, -17).value, '0.000000')
})
test('three sold, two physically recovered: inventory nine, no second loss deduction', () => {
  const sale = valuation(10, '10000', -3)
  const returned = returnQuantity(3, 2, 'Una se consumió')
  const final = valuation(sale.quantity, sale.value, returned.recovered, sale.unitCost)
  assert.equal(returned.notRecovered, 1); assert.equal(final.quantity, 9); assert.equal(final.value, '9000.000000')
})
test('returns cannot exceed source, and unrecovered units require a reason', () => {
  assert.throws(() => returnQuantity(3, 4, ''), InventoryError)
  assert.throws(() => returnQuantity(3, 0, ' '), InventoryError)
  assert.deepEqual(returnQuantity(3, 0, 'Se dañaron'), { recovered: 0, notRecovered: 3 })
})
test('complete segmented returns restore the exact original value despite repeating decimals', () => {
  let resolvedQuantity = 0; let resolvedValue = '0'; let stock = { quantity: 0, value: '0' }
  for (let n = 0; n < 3; n++) {
    const returned = returnValue(3, '10', resolvedQuantity, resolvedValue, 1, 1)
    stock = valuation(stock.quantity, stock.value, 1, '3.333333', returned.recoveredValue)
    resolvedQuantity++; resolvedValue = returned.resolvedValue
  }
  assert.equal(stock.value, '10.000000'); assert.equal(resolvedValue, '10.000000')
})
test('unchanged order does not resolve consumption; removal resolves only its delta', () => {
  const sources = [{ id: 1, line_key: 'a', product_id: 10, quantity: 3, resolved_quantity: 0 }]
  assert.equal(reductions(sources, new Map([['a', new Map([[10, 3]])]])).length, 0)
  assert.equal(reductions(sources, new Map([['a', new Map([[10, 2]])]]))[0].quantity, 1)
})
test('resolved consumption is not returned again and old composition remains the source', () => {
  const sources = [{ id: 2, line_key: 'new', product_id: 11, quantity: 6, resolved_quantity: 6 },
    { id: 1, line_key: 'original', product_id: 10, quantity: 12, resolved_quantity: 4 }]
  const result = reductions(sources, new Map())
  assert.deepEqual(result.map((r) => [r.source.product_id, r.quantity]), [[10, 8]])
})
test('newest eligible blocks are resolved first without moving retained blocks', () => {
  const sources = [{ id: 2, line_key: 'a', product_id: 10, quantity: 2, resolved_quantity: 0 },
    { id: 1, line_key: 'a', product_id: 10, quantity: 3, resolved_quantity: 0 }]
  assert.deepEqual(reductions(sources, new Map([['a', new Map([[10, 4]])]])).map((r) => [r.source.id, r.quantity]), [[2, 1]])
})
test('many tiny partial returns never over-allocate the historical cost', () => {
  let resolvedValue = '0'; let returned = 0
  for (let quantity = 0; quantity < 10; quantity++) {
    const part = returnValue(10, '0.000006', quantity, resolvedValue, 1, 1)
    assert.ok(Number(part.recoveredValue) >= 0)
    returned += Number(part.recoveredValue); resolvedValue = part.resolvedValue
  }
  assert.equal(resolvedValue, '0.000006')
  assert.ok(Math.abs(returned - 0.000006) < 1e-12)
})
