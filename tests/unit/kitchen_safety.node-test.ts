import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { DateTime } from 'luxon'
import { isKitchenOrderClosed, KitchenOperationError } from '../../app/services/kitchen_state.js'

type Service = typeof import('../../app/services/kitchen_service.js').default
const context = { companyId: 14, locationId: 3 }

function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const url = new URL(path, import.meta.url)
  const output = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  runInNewContext(output, { module, exports: module.exports, console, setTimeout: () => 0,
    require: (id: string) => {
      if (Object.hasOwn(dependencies, id)) return dependencies[id]
      throw new Error(`Unmocked dependency ${id}: real database access forbidden`)
    } })
  return module.exports as T
}

function fixture(overrides: Record<string, unknown> = {}, statuses = ['in_preparation']) {
  const trx = { transaction: true }
  const counters = { commits: 0, rollbacks: 0, saves: 0, locks: 0 }
  const readyAt = DateTime.fromISO('2026-10-10T19:10:16', { zone: 'America/Bogota' })
  const makeItem = (status: string, index: number) => ({ id: 5722 + index, orderId: 1858,
    kitchenStatus: status, kitchenReadyAt: readyAt, servedAt: status === 'served' ? readyAt.minus({ minutes: 7 }) : null,
    useTransaction: (client: unknown) => assert.equal(client, trx),
    save: async () => { counters.saves++ },
  })
  const items = statuses.map(makeItem)
  interface Query {
    where(key: string, value: unknown): Query
    forUpdate(): Query
    first(): Promise<any>
  }
  const queryFor = (rows: any[]): Query => {
    const filters: Array<[string, unknown]> = []
    let locked = false
    const query: Query = {
      where: (key, value) => { filters.push([key, value]); return query },
      forUpdate: () => { locked = true; counters.locks++; return query },
      first: async () => {
        assert.ok(locked, 'Every write must acquire the order/item lock')
        const columns: Record<string, string> = { company_id: 'companyId', location_id: 'locationId', order_id: 'orderId' }
        return rows.find(row => filters.every(([key, value]) => row[columns[key] || key] === value)) || null
      },
    }
    return query
  }
  const order = { id: 1858, companyId: 14, locationId: 3, status: 'pending', isServed: false,
    isReadyToServe: false, isPrepaid: false, isAdvancePayment: false, servedAt: null as DateTime | null,
    orderItems: items, ...overrides,
    useTransaction: (client: unknown) => assert.equal(client, trx),
    save: async () => { counters.saves++ },
    load: async (relation: string, callback: (query: Query) => void) => {
      assert.equal(relation, 'orderItems')
      callback(queryFor(items))
    },
  }
  const model = (rows: any[]) => ({ __esModule: true, default: { query: (options: { client: unknown }) => {
    assert.equal(options.client, trx, 'No second connection may be acquired')
    return queryFor(rows)
  } } })
  const database = { __esModule: true, default: { transaction: async (callback: (client: typeof trx) => Promise<any>) => {
    const orderBefore = { ...order }
    const itemsBefore = items.map(item => ({ ...item }))
    try { const result = await callback(trx); counters.commits++; return result }
    catch (error) {
      Object.assign(order, orderBefore)
      items.forEach((item, index) => Object.assign(item, itemsBefore[index]))
      counters.rollbacks++
      throw error
    }
  } } }
  const service = load<{ default: Service }>('../../app/services/kitchen_service.ts', {
    '#models/order': model([order]), '#models/order_item': model(items), '@adonisjs/lucid/services/db': database,
    'luxon': { DateTime }, '#services/kitchen_state': { isKitchenOrderClosed, KitchenOperationError },
  }).default
  return { service, order, items, counters }
}

function rejected(code: string) {
  return (error: any) => error instanceof KitchenOperationError && error.code === code
}

test('CUATES: late socket and dispatch cannot regress a paid/served order or change timestamps', async () => {
  const f = fixture({ status: 'paid', isServed: true, servedAt: DateTime.fromISO('2026-10-10T19:03:08') }, ['served'])
  const originalReady = f.items[0].kitchenReadyAt
  await assert.rejects(f.service.changeItem(context, 1858, 5722, true), rejected('KITCHEN_ORDER_CLOSED'))
  await assert.rejects(f.service.changeItem(context, 1858, 5722, false), rejected('KITCHEN_ORDER_CLOSED'))
  await assert.rejects(f.service.dispatch(context, 1858), rejected('KITCHEN_ORDER_CLOSED'))
  await assert.rejects(f.service.serve(context, 1858), rejected('KITCHEN_ORDER_CLOSED'))
  assert.equal(f.items[0].kitchenStatus, 'served')
  assert.equal(f.items[0].kitchenReadyAt, originalReady)
  assert.equal(f.counters.saves, 0)
  assert.equal(f.counters.rollbacks, 4)
})

test('rejects a paid regular order with inconsistent header flags', async () => {
  const f = fixture({ status: 'paid' }, ['ready'])
  await assert.rejects(f.service.dispatch(context, 1858), rejected('KITCHEN_ORDER_CLOSED'))
})

test('tenant, location and parent-item relationship are enforced', async () => {
  const f = fixture()
  await assert.rejects(f.service.changeItem({ ...context, companyId: 11 }, 1858, 5722, true), rejected('ORDER_NOT_FOUND'))
  await assert.rejects(f.service.dispatch({ ...context, locationId: 1 }, 1858), rejected('ORDER_NOT_FOUND'))
  await assert.rejects(f.service.changeItem(context, 1858, 999, true), rejected('ITEM_NOT_FOUND'))
  assert.equal(f.counters.saves, 0)
  assert.equal(f.counters.rollbacks, 3)
})

test('normal check, duplicate check, uncheck, dispatch and delivery preserve coherent states', async () => {
  const f = fixture()
  await f.service.changeItem(context, 1858, 5722, true)
  const readyAt = f.items[0].kitchenReadyAt
  await f.service.changeItem(context, 1858, 5722, true)
  assert.equal(f.items[0].kitchenReadyAt, readyAt)
  assert.equal(f.counters.saves, 1)
  await f.service.changeItem(context, 1858, 5722, false)
  assert.equal(f.items[0].kitchenReadyAt, null)
  await assert.rejects(f.service.dispatch(context, 1858), rejected('KITCHEN_NOT_READY'))
  await f.service.changeItem(context, 1858, 5722, true)
  await f.service.dispatch(context, 1858)
  await assert.rejects(f.service.changeItem(context, 1858, 5722, false), rejected('KITCHEN_ALREADY_DISPATCHED'))
  await assert.rejects(f.service.dispatch(context, 1858), rejected('KITCHEN_ALREADY_DISPATCHED'))
  await f.service.serve(context, 1858)
  const deliveredAt = f.items[0].servedAt
  await assert.rejects(f.service.serve(context, 1858), rejected('KITCHEN_ORDER_CLOSED'))
  assert.equal(f.items[0].kitchenStatus, 'served')
  assert.equal(f.order.servedAt, deliveredAt)
})

test('ampliacion preserves served items and only prepares/delivers new items', async () => {
  const f = fixture({}, ['served', 'in_preparation'])
  const servedAt = f.items[0].servedAt
  const readyAt = f.items[0].kitchenReadyAt
  await assert.rejects(f.service.changeItem(context, 1858, 5722, false), rejected('KITCHEN_ITEM_SERVED'))
  await f.service.changeItem(context, 1858, 5723, true)
  await f.service.dispatch(context, 1858)
  await f.service.serve(context, 1858)
  assert.equal(f.items[0].servedAt, servedAt)
  assert.equal(f.items[0].kitchenReadyAt, readyAt)
  assert.equal(f.items[1].kitchenStatus, 'served')
})

for (const flag of ['isPrepaid', 'isAdvancePayment']) {
  test(`${flag}: payment before delivery is permitted, finished order is immutable`, async () => {
    const f = fixture({ status: 'paid', [flag]: true })
    await f.service.changeItem(context, 1858, 5722, true)
    await f.service.dispatch(context, 1858)
    await f.service.serve(context, 1858)
    await assert.rejects(f.service.changeItem(context, 1858, 5722, true), rejected('KITCHEN_ORDER_CLOSED'))
  })
}

test('cancelled orders and empty orders cannot dispatch; legacy pending items can finish', async () => {
  const cancelled = fixture({ status: 'cancelled' })
  await assert.rejects(cancelled.service.changeItem(context, 1858, 5722, true), rejected('KITCHEN_ORDER_CLOSED'))
  await assert.rejects(cancelled.service.dispatch(context, 1858), rejected('KITCHEN_ORDER_CLOSED'))
  const empty = fixture({}, [])
  await assert.rejects(empty.service.dispatch(context, 1858), rejected('KITCHEN_NOT_READY'))
  const legacy = fixture({}, ['pending'])
  await legacy.service.dispatch(context, 1858)
  assert.equal(legacy.items[0].kitchenStatus, 'ready')
})


function socketHarness(service: Service) {
  let connection: (socket: any) => void = () => { throw new Error('Server not started') }
  const broadcasts: any[] = []
  const io = { attach: () => {}, use: () => {},
    on: (_event: string, handler: typeof connection) => { connection = handler },
    to: (room: string) => ({ emit: (event: string, data: unknown) => broadcasts.push({ room, event, data }) }),
  }
  class Server { constructor() { return io as any } }
  class AuthMiddleware { validateTokenOnEvent() { return () => {} } }
  const module = load<{ startSocketServer(): void }>('../../start/socket.ts', {
    '#middleware/sockets/socket_auth_middleware': { __esModule: true, default: AuthMiddleware, createSocketAuthMiddleware: () => () => {} },
    '#services/kitchen_service': { __esModule: true, default: service },
    '#services/kitchen_state': { KitchenOperationError },
    '@adonisjs/core/services/server': { __esModule: true, default: { getNodeServer: () => ({}) } },
    'socket.io': { Server },
  })
  module.startSocketServer()
  const handlers: Record<string, (data?: any) => any> = {}
  const errors: any[] = []
  const socket = { id: 'local-test-socket', data: { user: { id: 10, companyId: 14, locationId: 3, isActive: true },
    accessToken: { isExpired: () => false } }, rooms: new Set<string>(),
    join: (room: string) => socket.rooms.add(room),
    emit: (event: string, data: unknown) => { if (event === 'operation_error') errors.push(data) },
    on: (event: string, handler: (data?: any) => any) => { handlers[event] = handler },
  }
  connection(socket)
  handlers.join_kitchen_room({ companyId: 14, locationId: 3 })
  return { socket, handlers, errors, broadcasts }
}

test('actual socket handler rejects the CUATES late event and broadcasts no state mutation', async () => {
  const f = fixture({ status: 'paid', isServed: true }, ['served'])
  const h = socketHarness(f.service)
  await h.handlers.item_status_changed({ orderId: 1858, itemId: 5722, newStatus: true })
  assert.equal(h.errors[0].code, 'KITCHEN_ORDER_CLOSED')
  assert.equal(h.broadcasts.length, 0)
  assert.equal(f.counters.saves, 0)
})

test('actual socket handler enforces authenticated room, parent scope, boolean input and expiry', async () => {
  const f = fixture()
  const h = socketHarness(f.service)
  h.handlers.join_kitchen_room({ companyId: 11, locationId: 1 })
  assert.equal(h.socket.rooms.has('kitchen_room_11_1'), false)
  await h.handlers.item_status_changed({ orderId: 1858, itemId: 5722, newStatus: 'true' })
  assert.equal(h.errors.at(-1).code, 'KITCHEN_INVALID_EVENT')
  h.socket.rooms.clear()
  await h.handlers.item_status_changed({ orderId: 1858, itemId: 5722, newStatus: true })
  assert.equal(h.errors.at(-1).code, 'KITCHEN_ROOM_REQUIRED')
  h.socket.data.accessToken.isExpired = () => true
  await h.handlers.item_status_changed({ orderId: 1858, itemId: 5722, newStatus: true })
  assert.equal(h.errors.at(-1).code, 'KITCHEN_UNAUTHORIZED')
  assert.equal(f.counters.saves, 0)
})

test('actual socket handler broadcasts a reversible pending check and isolates another tenant', async () => {
  const f = fixture()
  const h = socketHarness(f.service)
  await h.handlers.item_status_changed({ orderId: 1858, itemId: 5722, newStatus: true })
  assert.equal(h.broadcasts[0].data.kitchenStatus, 'pending')
  assert.equal(h.broadcasts[0].room, 'kitchen_room_14_3')
  h.socket.data.user.companyId = 11
  h.socket.rooms.add('kitchen_room_11_3')
  await h.handlers.item_status_changed({ orderId: 1858, itemId: 5722, newStatus: false })
  assert.equal(h.errors.at(-1).code, 'ORDER_NOT_FOUND')
  assert.equal(f.items[0].kitchenStatus, 'pending')
})


test('previously dispatched ready items stay locked when a new item returns the order to kitchen', async () => {
  const f = fixture({}, ['ready', 'served', 'in_preparation'])
  const oldReadyAt = f.items[0].kitchenReadyAt
  const oldServedAt = f.items[1].servedAt
  await assert.rejects(f.service.changeItem(context, 1858, 5722, false), rejected('KITCHEN_ITEM_DISPATCHED'))
  await assert.rejects(f.service.changeItem(context, 1858, 5722, true), rejected('KITCHEN_ITEM_DISPATCHED'))
  await f.service.changeItem(context, 1858, 5724, true)
  assert.equal(f.items[2].kitchenStatus, 'pending')
  await f.service.changeItem(context, 1858, 5724, false)
  assert.equal(f.items[2].kitchenStatus, 'in_preparation')
  await f.service.changeItem(context, 1858, 5724, true)
  await f.service.dispatch(context, 1858)
  assert.equal(f.items[0].kitchenReadyAt, oldReadyAt)
  assert.equal(f.items[1].servedAt, oldServedAt)
  assert.equal(f.items[2].kitchenStatus, 'ready')
})
