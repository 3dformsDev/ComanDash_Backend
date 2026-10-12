import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blocksTableRecovery } from '../../app/services/table_availability.js'
test('only delivered paid orders and cancelled orders allow an empty-table recovery', () => {
  assert.equal(blocksTableRecovery({ status: 'paid', isServed: true }), false)
  assert.equal(blocksTableRecovery({ status: 'cancelled', isServed: false }), false)
  for (const status of ['pending', 'ready', 'served', 'paid']) {
    assert.equal(blocksTableRecovery({ status, isServed: false }), true)
  }
  assert.equal(blocksTableRecovery({ status: 'served', isServed: true }), true)
})
