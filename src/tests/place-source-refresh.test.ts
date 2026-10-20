// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { refreshPlaceSourceEvidence } from '#lib/places/sourceRefresh.js'
import {
  planPlaceSourceComparisons,
  readPlaceSourceInventory,
} from '#lib/places/sourceInventory.js'
import type { D1Database } from '@cloudflare/workers-types'

const stores: DatabaseSync[] = []
afterEach(() => {
  for (const db of stores.splice(0)) db.close()
})
const inventory = (release = 'old', extra = {}) => ({
  apiReleaseSetCode: release,
  datasetCode: 'dataset',
  resourceType: 'place',
  sourceVariant: 'default',
  sourceReleaseCode: release,
  snapshotCode: 'snapshot',
  role: 'primary',
  recordsAvailable: true,
  ...extra,
})
const pin = {
  datasetCode: 'dataset',
  resourceType: 'place',
  fromRelease: 'resolved-old',
  toRelease: 'resolved-new',
}
const page = (start = 0, nextCursor: string | null = null, count = 100) => ({
  pin,
  nextCursor,
  records: Array.from({ length: count }, (_, i) => ({
    sourceRecordId: `${start + i}`,
    type: 'removed',
    before: { sourceRecordId: `${start + i}`, properties: {} },
    after: null,
    fields: [],
  })),
})
function setup() {
  const sqlite = new DatabaseSync(':memory:')
  stores.push(sqlite)
  sqlite.exec(
    'PRAGMA foreign_keys=ON; CREATE TABLE placeRefresh(runId TEXT,accepted TEXT,target TEXT,phase TEXT);',
  )
  sqlite.exec(readFileSync('migrations/0119_place_source_changes.sql', 'utf8'))
  sqlite
    .prepare(
      'INSERT INTO placeSourceTransition(id,fromPublication,toPublication) VALUES(?,?,?)',
    )
    .run(
      'run',
      JSON.stringify({ pin: { releaseSet: 'old' } }),
      JSON.stringify({ pin: { releaseSet: 'new' } }),
    )
  const prepare = (query: string, values: unknown[] = []) => ({
    bind: (...args: unknown[]) => prepare(query, args),
    first: async () => sqlite.prepare(query).get(...(values as never[])) ?? null,
    run: async () => ({
      success: true,
      meta: {
        changes: Number(sqlite.prepare(query).run(...(values as never[])).changes),
      },
    }),
  })
  const db = {
    prepare,
    batch: async (statements: ReturnType<typeof prepare>[]) => {
      sqlite.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.run())
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  } as unknown as D1Database
  const request = vi.fn(async (url: URL) =>
    Response.json({ sourceReleases: [inventory(url.searchParams.get('releaseSet')!)] }),
  )
  const source = {
    baseUrl: 'https://source.example',
    apiKey: 'fixture',
    fetch: request as unknown as typeof fetch,
  }
  return {
    sqlite,
    request,
    source,
    tick: () => refreshPlaceSourceEvidence(db, source),
    state: () => sqlite.prepare('SELECT * FROM placeSourceTransition').get()!,
    comparison: () => sqlite.prepare('SELECT * FROM placeSourceComparison').get()!,
  }
}

it('deduplicates roles, excludes Address dependencies and plans only changed publishers', () => {
  const plan = planPlaceSourceComparisons(
    [inventory()],
    [
      inventory('new'),
      inventory('new', { role: 'dependency' }),
      inventory('new', { resourceType: 'address' }),
    ],
  )
  expect(plan.comparisons).toHaveLength(1)
  expect(plan.reviewRequired).toBe(false)
  expect(
    planPlaceSourceComparisons([inventory()], [inventory()]).outcomes[0].reason,
  ).toBe('unchanged')
  expect(planPlaceSourceComparisons(null, [inventory()]).outcomes[0].reason).toBe(
    'baseline',
  )
})
it.each([
  [[inventory()], [], 'removed-dataset'],
  [[], [inventory()], 'added-dataset'],
  [[inventory()], [inventory('new', { recordsAvailable: false })], 'unavailable'],
  [[inventory()], [inventory('new'), inventory('other')], 'ambiguous'],
  [[inventory()], [inventory('new', { sourceVariant: 'other' })], 'ambiguous'],
] as const)(
  'retains review outcomes for incomplete or ambiguous discovery',
  (before, after, reason) => {
    const result = planPlaceSourceComparisons([...before], [...after])
    expect(result.reviewRequired).toBe(true)
    expect(result.outcomes[0].reason).toBe(reason)
    expect(result.comparisons).toHaveLength(0)
  },
)
it('rejects mismatched and oversized inventory', async () => {
  const s = setup()
  s.request.mockResolvedValueOnce(
    Response.json({ sourceReleases: [inventory('wrong')] }),
  )
  await expect(readPlaceSourceInventory(s.source, 'new')).rejects.toThrow('mismatch')
  s.request.mockResolvedValueOnce(
    Response.json({
      sourceReleases: Array.from({ length: 501 }, () => inventory('new')),
    }),
  )
  await expect(readPlaceSourceInventory(s.source, 'new')).rejects.toThrow()
})
it('resumes with exact pins, retains removals as evidence and finishes without replay', async () => {
  const s = setup()
  expect(await s.tick()).toBe('planned')
  s.request.mockResolvedValueOnce(Response.json(page(0, 'next')))
  expect(await s.tick()).toBe('collected')
  s.request.mockResolvedValueOnce(Response.json(page(100, null, 1)))
  expect(await s.tick()).toBe('collected')
  const url = s.request.mock.calls.at(-1)![0]
  expect(url.searchParams.get('fromRelease')).toBe(pin.fromRelease)
  expect(url.searchParams.get('cursor')).toBe('next')
  expect(s.comparison()).toMatchObject({ complete: 1, removed: 101, pageNumber: 2 })
  expect(await s.tick()).toBe('complete')
  expect(await s.tick()).toBe('idle')
  expect(() => s.sqlite.exec('DELETE FROM placeSourcePage')).toThrow('immutable')
  expect(s.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
it.each(['duplicate', 'wrong-pin', 'late-insert'] as const)(
  'rolls back page progress on %s',
  async failure => {
    const s = setup()
    await s.tick()
    s.request.mockResolvedValueOnce(Response.json(page(0, 'next')))
    await s.tick()
    if (failure === 'late-insert')
      s.sqlite.exec(
        "CREATE TRIGGER fail_page BEFORE INSERT ON placeSourcePage BEGIN SELECT RAISE(ABORT,'late failure'); END",
      )
    const response = page(failure === 'duplicate' ? 0 : 100, null, 1)
    if (failure === 'wrong-pin') response.pin = { ...pin, toRelease: 'unexpected' }
    s.request.mockResolvedValueOnce(Response.json(response))
    await expect(s.tick()).rejects.toThrow()
    expect(s.comparison()).toMatchObject({
      pageNumber: 1,
      removed: 100,
      cursor: 'next',
      complete: 0,
    })
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM placeSourcePage').get()!.n).toBe(
      1,
    )
    expect(s.state()).toMatchObject({
      failures: 1,
      lastError: 'PLACE_SOURCE_EVIDENCE_STEP_FAILED',
      lease: null,
    })
    expect(await s.tick()).toBe('idle')
  },
)
it('does not persist responses after ownership is lost', async () => {
  const s = setup()
  await s.tick()
  s.request.mockImplementationOnce(async () => {
    s.sqlite.exec("UPDATE placeSourceTransition SET lease='another-worker'")
    return Response.json(page(0, null, 1))
  })
  expect(await s.tick()).toBe('superseded')
  expect(s.comparison().pageNumber).toBe(0)
  expect(s.state().lease).toBe('another-worker')
})
it('does not persist responses after the lease expires', async () => {
  const s = setup()
  await s.tick()
  s.request.mockImplementationOnce(async () => {
    s.sqlite.exec('UPDATE placeSourceTransition SET leaseUntil=0')
    return Response.json(page(0, null, 1))
  })
  expect(await s.tick()).toBe('superseded')
  expect(s.comparison().pageNumber).toBe(0)
})

it('rejects a cursor cycle without advancing evidence', async () => {
  const s = setup()
  await s.tick()
  for (const [start, cursor] of [
    [0, 'a'],
    [100, 'b'],
  ] as const) {
    s.request.mockResolvedValueOnce(Response.json(page(start, cursor)))
    await s.tick()
  }
  s.request.mockResolvedValueOnce(Response.json(page(200, 'a')))
  await expect(s.tick()).rejects.toThrow()
  expect(s.comparison()).toMatchObject({ pageNumber: 2, removed: 200, cursor: 'b' })
})

it('keeps evidence atomic when database time expires between batch statements', async () => {
  const s = setup()
  await s.tick()
  s.sqlite.exec(`CREATE TRIGGER expire_during_batch AFTER UPDATE ON placeSourceComparison
    BEGIN UPDATE placeSourceTransition SET leaseUntil=0; END`)
  s.request.mockResolvedValueOnce(Response.json(page(0, null, 1)))
  expect(await s.tick()).toBe('collected')
  expect(s.comparison()).toMatchObject({ pageNumber: 1, removed: 1, complete: 1 })
  expect(
    s.sqlite.prepare('SELECT COUNT(*) AS n FROM placeSourceEvidenceId').get()!.n,
  ).toBe(1)
})

it('flags an unavailable initial publisher for review', () => {
  const plan = planPlaceSourceComparisons(null, [
    inventory('new', { recordsAvailable: false }),
  ])
  expect(plan.reviewRequired).toBe(true)
  expect(plan.outcomes[0].reason).toBe('unavailable')
})
