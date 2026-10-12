import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { DateTime } from 'luxon'

type BusinessDayModule = typeof import('../../app/services/reports/business_day_service.js')
type OperatingModule = typeof import('../../app/services/cash_register_operating_service.js')

// Execute the real services with inert model doubles. No Adonis boot or database access.
function loadService<T>(relativePath: string, dependencies: Record<string, unknown>): T {
  const url = new URL(relativePath, import.meta.url)
  const output = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: url.pathname,
  }).outputText
  const module = { exports: {} }
  runInNewContext(output, {
    module,
    exports: module.exports,
    require: (id: string) => {
      if (id === 'luxon') return { DateTime }
      if (Object.hasOwn(dependencies, id)) return dependencies[id]
      throw new Error(`Unexpected dependency: ${id}; real database access is forbidden`)
    },
  }, { filename: url.pathname })
  return module.exports as T
}

interface QueryCall {
  model: string
  client: unknown
  filters: Array<[string, unknown]>
  locked: boolean
}

interface TestQuery {
  where(column: string, value: unknown): TestQuery
  whereHas(relation: string, callback: (builder: TestQuery) => void): TestQuery
  orderBy(): TestQuery
  forUpdate(): TestQuery
  first(): Promise<unknown>
}

const now = DateTime.fromISO('2026-10-11T18:00:00', { zone: 'America/Bogota' })
const previousSession = {
  id: 152,
  businessDate: now.minus({ days: 1 }).startOf('day'),
  businessDayCutoffHour: 4,
  openedAt: now.minus({ days: 1 }),
  recoveryAuthorizedUntil: now.plus({ minutes: 60 }),
  recoveryAuthorizedBy: 10,
  recoveryReason: 'Prueba local',
}

function fixture(options: {
  exhausted?: boolean
  session?: typeof previousSession | null
  setting?: string | null
  settingError?: Error
} = {}) {
  const trx = { marker: 'already-held-connection' }
  const calls: QueryCall[] = []
  let extraAcquires = 0
  const makeModel = (model: string, row: unknown) => ({
    __esModule: true,
    default: {
      query: (queryOptions?: { client?: unknown }) => {
        if (options.exhausted && queryOptions?.client !== trx) {
          extraAcquires++
          throw Object.assign(new Error('Timeout acquiring a connection'), { code: 'POOL_EXHAUSTED' })
        }
        const call: QueryCall = { model, client: queryOptions?.client, filters: [], locked: false }
        calls.push(call)
        const query: TestQuery = {
          where: (column: string, value: unknown) => { call.filters.push([column, value]); return query },
          whereHas: (relation: string, callback: (builder: TestQuery) => void) => {
            assert.equal(relation, 'cashRegister')
            callback(query)
            return query
          },
          orderBy: () => query,
          forUpdate: () => { call.locked = true; return query },
          first: async () => {
            if (model === 'setting' && options.settingError) throw options.settingError
            return row
          },
        }
        return query
      },
    },
  })
  const businessDay = loadService<BusinessDayModule>('../../app/services/reports/business_day_service.ts', {
    '#models/company_setting': makeModel('setting', options.setting === null ? null : { settingValue: options.setting ?? '4' }),
  })
  const { default: OperatingService } = loadService<OperatingModule>('../../app/services/cash_register_operating_service.ts', {
    '#models/cash_registers_session': makeModel('session', options.session ?? null),
    '#models/activity_log': {},
    '#services/reports/business_day_service': businessDay,
  })
  return { service: new OperatingService(), businessDay, trx, calls, extraAcquires: () => extraAcquires }
}

test('previous-day recovery succeeds with no spare pool connection and preserves tenant and lock', async () => {
  const ctx = fixture({ exhausted: true, session: previousSession })
  const state = await ctx.service.getState(14, 3, { trx: ctx.trx, lockForUpdate: true, now })
  assert.equal(ctx.extraAcquires(), 0)
  assert.equal(ctx.calls.length, 2)
  for (const call of ctx.calls) {
    assert.equal(call.client, ctx.trx)
    assert.ok(call.filters.some(([column, value]) => column === 'company_id' && value === 14))
  }
  assert.equal(ctx.calls[0].locked, true)
  assert.ok(ctx.calls[0].filters.some(([column, value]) => column === 'location_id' && value === 3))
  assert.ok(ctx.calls[1].filters.some(([column, value]) => column === 'setting_key' && value === 'business_day_cutoff_hour_location_3'))
  assert.equal(state.sessionId, 152)
  assert.equal(state.status, 'open_previous')
  assert.equal(state.recoveryIsActive, true)
  assert.equal(state.sessionBusinessDate, '2026-10-10')
  assert.equal(state.currentBusinessDate, '2026-10-11')
})

test('concurrent recovery state checks keep each held transaction without an extra acquisition', async () => {
  const contexts = Array.from({ length: 10 }, () => fixture({ exhausted: true, session: previousSession }))
  const results = await Promise.all(contexts.map((ctx) => ctx.service.getState(14, 3, { trx: ctx.trx, now })))
  assert.ok(results.every((state) => state.recoveryIsActive))
  for (const ctx of contexts) {
    assert.equal(ctx.extraAcquires(), 0)
    assert.ok(ctx.calls.every((call) => call.client === ctx.trx))
  }
})

test('ordinary nontransactional checks preserve cutoff defaults, boundaries and Colombia business date', async () => {
  for (const [setting, cutoff] of [[null, 4], ['invalid', 4], ['0', 0], ['23', 23]] as const) {
    const ctx = fixture({ setting })
    const state = await ctx.service.getState(11, 1, { now })
    assert.equal(state.status, 'no_open_session')
    assert.equal(state.businessDayCutoffHour, cutoff)
    assert.equal(state.currentBusinessDate, cutoff === 23 ? '2026-10-10' : '2026-10-11')
    assert.ok(ctx.calls.every((call) => call.client === undefined && !call.locked))
    assert.equal(await ctx.businessDay.getBusinessDayCutoffHour(11, 1), cutoff)
  }
})

test('a setting query failure propagates without retrying on another connection', async () => {
  const failure = new Error('Simulated setting read failure')
  const ctx = fixture({ exhausted: true, session: previousSession, settingError: failure })
  await assert.rejects(ctx.service.getState(14, 3, { trx: ctx.trx, now }), (error) => error === failure)
  assert.equal(ctx.extraAcquires(), 0)
  assert.equal(ctx.calls.length, 2)
})
