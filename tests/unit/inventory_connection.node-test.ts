import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { InventoryError, json } from '../../app/services/inventory/inventory_math.js'

// Real service/validator code, inert dependencies: no Adonis boot or DB/Redis calls.
function load(path: string, dependencies: Record<string, unknown>): any {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  runInNewContext(source, { module, exports: module.exports, require: (id: string) => {
    if (!Object.hasOwn(dependencies, id)) throw new Error(`Unexpected dependency: ${id}; real DB access forbidden`)
    return dependencies[id]
  } })
  return module.exports
}

function fixture() {
  const calls: Array<{ client: any; table: string; filters: any[] }> = []
  let defaultAcquires = 0
  let defaultAvailable = false
  let row: any = null
  const from = (client: any, table: string) => {
    const call = { client, table, filters: [] as any[] }; calls.push(call)
    const query = { where: (...filter: any[]) => { call.filters.push(filter); return query }, first: async () => row }
    return query
  }
  const trx: any = { isCompleted: false, from: (table: string) => from(trx, table) }
  const database = { from: (table: string) => {
    defaultAcquires++
    if (!defaultAvailable) throw new Error('POOL_FULL_SECOND_CONNECTION')
    return from(database, table)
  } }
  const ctx: any = { companyId: 11, locationId: 1, cashTransactionTrx: trx,
    request: { header: () => 'local_test_intent_123456', method: () => 'POST', url: () => '/api/v1/orders', body: () => ({ quantity: 1 }) },
    auth: { user: { id: 15 } } }
  const user: any = { id: 15, fullName: 'Local test', role: { code: 'admin' }, load: async (_name: string, callback: any) => {
    let client: any
    callback?.({ useTransaction: (value: any) => { client = value } })
    if (client) { calls.push({ client, table: 'roles', filters: [] }); return }
    defaultAcquires++
    if (!defaultAvailable) throw new Error('POOL_FULL_SECOND_CONNECTION')
  } }
  ctx.auth.getUserOrFail = async () => user
  const Mutation = load('../../app/services/inventory/inventory_mutation_service.ts', {
    'node:crypto': { createHash }, '@adonisjs/lucid/services/db': { __esModule: true, default: database },
    './inventory_math.js': { InventoryError, json }, './inventory_ledger_service.js': { now: () => '' }, '#start/socket': { io: {} },
  }).default
  const Access = load('../../app/services/inventory/inventory_access_service.ts', { './inventory_math.js': { InventoryError } }).default
  return { calls, trx, database, ctx, user, Mutation, Access,
    setRow: (value: any) => row = value, allowDefault: () => defaultAvailable = true,
    defaultAcquires: () => defaultAcquires }
}

test('inventory replay reuses inherited and explicit transactions with the pool fully occupied', async () => {
  const f = fixture()
  assert.equal(await f.Mutation.replay(f.ctx), null)
  delete f.ctx.cashTransactionTrx
  assert.equal(await f.Mutation.replay(f.ctx, f.trx), null)
  assert.equal(f.defaultAcquires(), 0)
  assert.ok(f.calls.every(call => call.client === f.trx))
  const filter = f.calls[0].filters[0][0]
  assert.equal(filter.company_id, 11); assert.equal(filter.location_id, 1); assert.equal(filter.actor_id, 15)
})

test('replay preserves the exact result and rejects a changed request fingerprint', async () => {
  const f = fixture()
  f.setRow({ fingerprint: f.Mutation.fingerprint(f.ctx), result: JSON.stringify({ orderId: 12 }) })
  assert.equal((await f.Mutation.replay(f.ctx)).orderId, 12)
  f.ctx.request.body = () => ({ quantity: 2 })
  await assert.rejects(f.Mutation.replay(f.ctx), (error: any) => error.code === 'INVENTORY_REQUEST_CHANGED')
  assert.equal(f.defaultAcquires(), 0)
})

test('completed transactions are not reused for postcommit replay or permission checks', async () => {
  const f = fixture(); f.trx.isCompleted = true; f.allowDefault()
  assert.equal(await f.Mutation.replay(f.ctx), null)
  assert.equal((await f.Access.scope(f.ctx)).role, 'admin')
  assert.equal(f.defaultAcquires(), 2)
  assert.equal(f.calls[0].client, f.database)
})

test('role lookup shares the held connection and operational users still cannot manage stock', async () => {
  const f = fixture()
  assert.equal((await f.Access.scope(f.ctx, true)).companyId, 11)
  delete f.ctx.cashTransactionTrx
  f.user.role.code = 'waiter'
  await assert.rejects(f.Access.scope(f.ctx, true, f.trx), (error: any) => error.code === 'INVENTORY_FORBIDDEN')
  assert.equal((await f.Access.scope(f.ctx, false, f.trx)).role, 'waiter')
  assert.equal(f.defaultAcquires(), 0)
  assert.ok(f.calls.every(call => call.client === f.trx))
})

function validators() {
  let checks: any[] = []
  let schema: any
  schema = new Proxy({}, { get: (_target, name) => name === 'exists' ? (callback: any) => { checks.push(callback); return schema } : () => schema })
  const vine = new Proxy({}, { get: (_target, name) => name === 'compile' ? () => {
    const compiled = { checks }; checks = []; return compiled
  } : () => schema })
  return load('../../app/validators/order.ts', { '@vinejs/vine': { __esModule: true, default: vine } })
}

test('all order existence checks reuse the transaction and retain company/location filters', async () => {
  const f = fixture(); const v = validators()
  const compiled = [v.createOrderValidator(11, 1, f.trx), v.updateOrderValidator(11, 1, f.trx), v.cancelOrderValidator(11, f.trx)]
  for (const validator of compiled) for (const check of validator.checks) await check(f.database, 83)
  assert.equal(f.calls.length, 8)
  assert.equal(f.defaultAcquires(), 0)
  for (const call of f.calls) {
    assert.equal(call.client, f.trx)
    assert.ok(call.filters.some(([key, value]) => key === 'company_id' && value === 11))
    if (call.table === 'tables') assert.ok(call.filters.some(([key, value]) => key === 'location_id' && value === 1))
  }
})

test('validators without an existing transaction retain the ordinary database behavior', async () => {
  const f = fixture(); f.allowDefault(); const v = validators()
  for (const check of v.cancelOrderValidator(11).checks) await check(f.database, 83)
  assert.equal(f.defaultAcquires(), 1)
  assert.equal(f.calls[0].client, f.database)
})
