// @vitest-environment node
// NODE
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
// VITEST
import { afterEach, describe, expect, it, vi } from 'vitest'
// SERVICES
import { refreshDivisions } from '../../workers/division-refresh/src/refresh'
import {
  apiRead,
  covers,
  geocodeSchema,
  polygonSchema,
} from '../../workers/division-refresh/src/api'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'

const stores: DatabaseSync[] = []
afterEach(() => {
  for (const db of stores.splice(0)) db.close()
})
const now = Date.UTC(2026, 8, 13)
const polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ],
}
const member = (id: string) => ({
  id,
  level: 5,
  category: 'hood',
  class: 'neighbourhood',
  names: { en: { name: id } },
})
const geocoded = (ids = ['village'], release = 'r2') => ({
  jsonapi: { version: '1.1' },
  data: [
    {
      type: 'geocoding-results',
      id: 'lookup',
      attributes: { status: 'resolved' },
      relationships: { hood: { data: ids.map(id => ({ type: 'divisions', id })) } },
    },
  ],
  included: ids.map(id => ({
    type: 'divisions',
    id,
    attributes: {
      category: 'hood',
      class: 'neighbourhood',
      level: 5,
      i18n: { en: { name: id } },
    },
  })),
  meta: { release: { apiReleaseSet: release } },
})
const definition = (geometry = polygon) => ({
  divisionId: 'village',
  apiReleaseSet: 'r2',
  attributes: member('village'),
  membershipGeometry: [{ geometry }],
})
const change = (overrides = {}) => ({
  id: 'c1',
  divisionId: 'village',
  type: 'revision',
  canAffectGeocodingMembership: true,
  before: definition(),
  after: definition(),
  affectedDescendantIds: { before: [], after: [] },
  ...overrides,
})
const page = (data = [change()], nextCursor: string | null = null) => ({
  data,
  meta: {
    fromApiReleaseSet: { id: 'id1', code: 'r1' },
    toApiReleaseSet: { id: 'id2', code: 'r2' },
    comparisonId: 'comparison',
    nextCursor,
    membershipGeometry: 'stub',
  },
})

/** Runs production statements and atomic D1 batches against real SQLite. */
function setup() {
  const sqlite = new DatabaseSync(':memory:')
  stores.push(sqlite)
  sqlite.exec(readFileSync('src/tests/fixtures/feature-query-base.sql', 'utf8'))
  for (const migration of [
    '0078_feature_spatial_index',
    '0079_feature_query_indexes',
    '0080_feature_count_cache',
    '0081_feature_search_fts',
    '0082_feature_division_refresh',
    '0083_feature_division_registry',
  ])
    sqlite.exec(readFileSync(`migrations/${migration}.sql`, 'utf8'))
  const prepare = (sql: string, values: unknown[] = []) => ({
    bind: (...args: unknown[]) => prepare(sql, args),
    first: async () => sqlite.prepare(sql).get(...(values as never[])) ?? null,
    all: async () => ({
      results: sqlite.prepare(sql).all(...(values as never[])),
      success: true,
    }),
    run: async () => ({
      success: true,
      meta: {
        changes: Number(sqlite.prepare(sql).run(...(values as never[])).changes),
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
  const add = (id: string, x = 5, y = 5) =>
    sqlite
      .prepare(
        "INSERT INTO feature(id,geometry,organisationId,projectId,layerId) VALUES(?,?,'org-1','project-1','layer-1')",
      )
      .run(id, JSON.stringify({ type: 'Point', coordinates: [x, y] }))
  const tick = (fetcher: typeof fetch) =>
    refreshDivisions(db, { baseUrl: 'https://api.saanseoi.hk', fetcher }, now)
  const count = (table: string) =>
    Number(sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n)
  return { sqlite, db, add, tick, count }
}

describe('division refresh', () => {
  it('accepts the retained live Atlas response and preserves separate hierarchy branches', () => {
    const result = geocodeSchema.parse(
      JSON.parse(
        readFileSync('src/tests/fixtures/saanseoi-geocode-central.json', 'utf8'),
      ),
    )
    expect(result.meta.release.apiReleaseSet).toBe('data-hk-divisions-2026-09-01.0')
    expect(result.data.memberships.filter(member => member.level === 1)).toHaveLength(2)
    expect(result.data.branches.administrative).toHaveLength(1)
    expect(result.data.branches.locality).toHaveLength(1)
    expect(
      result.data.memberships.some(member => member.names.en?.name === 'Central'),
    ).toBe(true)
  })

  it('uses the actual public API key header and pins the geocoding release', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(geocoded()))
    await apiRead(
      { baseUrl: 'https://api.saanseoi.hk', token: 'test-key', fetcher },
      '/divisions/v1/geocode',
      { lat: '5', lng: '5', apiReleaseSet: 'r2' },
      geocodeSchema,
    )
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      headers: { 'x-api-key': 'test-key' },
      redirect: 'error',
    })
    expect(
      new URL(String(fetcher.mock.calls[0][0])).searchParams.get('apiReleaseSet'),
    ).toBe('r2')
  })

  it('rejects an upstream comparison that changes release during pagination', async () => {
    const s = setup()
    s.sqlite.exec(
      "UPDATE divisionRefresh SET appliedRelease='r1',targetRelease='r2',targetReleaseId='id2',comparisonId='comparison',phase='changes',cursor='next'",
    )
    const result = page([])
    result.meta.toApiReleaseSet.id = 'different'
    await expect(s.tick(async () => Response.json(result))).rejects.toThrow(
      'RELEASE_MISMATCH',
    )
    expect(
      s.sqlite.prepare('SELECT cursor,appliedRelease FROM divisionRefresh').get(),
    ).toMatchObject({ cursor: 'next', appliedRelease: 'r1' })
  })

  it('retries a geocode response for the wrong release without replacing membership', async () => {
    const s = setup()
    s.add('a')
    await s.tick(async () => Response.json(geocoded()))
    await s.tick(async () => Response.json(geocoded(['wrong'], 'r3')))
    expect(s.count('featureDivisionMembership')).toBe(0)
    expect(s.count('featureDivisionJob')).toBe(1)
  })

  it('adds spatial members across resumable candidate batches without touching outside features', async () => {
    const s = setup()
    for (let i = 0; i < 105; i++) s.add(String(i).padStart(3, '0'))
    s.add('outside', 50, 50)
    s.sqlite.exec(
      "DELETE FROM featureDivisionJob; UPDATE divisionRefresh SET appliedRelease='r1',phase='changes'",
    )
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(page([change({ type: 'addition', before: null })])),
    )
    await s.tick(fetcher)
    await s.tick(fetcher)
    expect(s.count('featureDivisionJob')).toBe(100)
    expect(s.count('divisionRefreshChange')).toBe(1)
    await s.tick(fetcher)
    expect(s.count('featureDivisionJob')).toBe(105)
    expect(s.count('divisionRefreshChange')).toBe(0)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('bootstraps once, counts unique division IDs and keeps scope moves and deletes exact', async () => {
    const s = setup()
    s.add('a')
    s.add('b')
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(geocoded()))
    await s.tick(fetcher)
    await s.tick(fetcher)
    expect(
      s.sqlite.prepare('SELECT appliedRelease,phase FROM divisionRefresh').get(),
    ).toMatchObject({ appliedRelease: 'r2', phase: 'idle' })
    expect(
      s.sqlite.prepare('SELECT totalCount FROM featureCountRollup').get()?.totalCount,
    ).toBe(2)
    s.sqlite.exec("UPDATE feature SET layerId='layer-2' WHERE id='a'")
    expect(s.count('featureCountRollup')).toBe(2)
    s.sqlite.exec("DELETE FROM feature WHERE id='a'")
    expect(
      s.sqlite.prepare('SELECT totalCount FROM featureCountRollup').get()?.totalCount,
    ).toBe(1)
    await s.tick(fetcher)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('rechecks new geometry on expansion while avoiding unaffected features', async () => {
    const s = setup()
    s.add('old', 20, 20)
    s.add('new')
    s.add('outside', 30, 30)
    const first = vi.fn<typeof fetch>(async (url: URL | RequestInfo) =>
      Response.json(
        geocoded(
          new URL(String(url)).searchParams.get('lng') === '20'
            ? ['village']
            : ['different'],
          'r1',
        ),
      ),
    )
    await s.tick(first)
    await s.tick(first)
    s.sqlite.exec("UPDATE divisionRefresh SET checkedMonth='2026-08'")
    const fetcher = vi.fn<typeof fetch>(async (url: URL | RequestInfo) =>
      Response.json(String(url).includes('/changes') ? page() : geocoded()),
    )
    await s.tick(fetcher)
    await s.tick(fetcher)
    await s.tick(fetcher)
    expect(
      s.sqlite
        .prepare('SELECT featureId FROM featureDivisionJob ORDER BY featureId')
        .all(),
    ).toEqual([{ featureId: 'new' }, { featureId: 'old' }])
    await s.tick(fetcher)
    await s.tick(fetcher)
    expect(
      s.sqlite.prepare('SELECT appliedRelease FROM divisionRefresh').get()
        ?.appliedRelease,
    ).toBe('r2')
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('schedules deletions and transitive descendants without a spatial scan', async () => {
    const s = setup()
    s.add('a', 30, 30)
    s.add('b', 40, 40)
    await s.tick(async () => Response.json(geocoded(['child'], 'r1')))
    await s.tick(async () => Response.json(geocoded(['child'], 'r1')))
    s.sqlite.exec("UPDATE divisionRefresh SET checkedMonth='2026-08'")
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(
        page([
          change({
            type: 'deletion',
            after: null,
            affectedDescendantIds: { before: ['child'], after: [] },
          }),
        ]),
      ),
    )
    await s.tick(fetcher)
    await s.tick(fetcher)
    await s.tick(fetcher)
    expect(s.count('featureDivisionJob')).toBe(2)
  })

  it('refreshes metadata without geocoding and pins pagination', async () => {
    const s = setup()
    s.add('metadata-member')
    await s.tick(async () => Response.json(geocoded(['village'], 'r1')))
    await s.tick(async () => Response.json(geocoded(['village'], 'r1')))
    s.sqlite.exec("UPDATE divisionRefresh SET appliedRelease='r1',phase='changes'")
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(page([change({ canAffectGeocodingMembership: false })], 'next')),
    )
    await s.tick(fetcher)
    await s.tick(fetcher)
    await s.tick(fetcher)
    fetcher.mockImplementation(async () => Response.json(page([], null)))
    await s.tick(fetcher)
    await s.tick(fetcher)
    const url = new URL(String(fetcher.mock.calls[1][0]))
    expect(url.searchParams.get('toApiReleaseSet')).toBe('r2')
    expect(url.searchParams.get('page[cursor]')).toBe('next')
    expect(s.count('divisionDefinition')).toBe(1)
    expect(
      s.sqlite.prepare('SELECT appliedRelease FROM divisionRefresh').get()
        ?.appliedRelease,
    ).toBe('r2')
  })

  it('rejects stale coordinates and retains a newer job generation', async () => {
    const s = setup()
    s.add('a')
    await s.tick(async () => Response.json(geocoded()))
    await s.tick(async () => {
      s.sqlite.exec(
        `UPDATE feature SET geometry='{"type":"Point","coordinates":[8,8]}' WHERE id='a'`,
      )
      return Response.json(geocoded())
    })
    expect(s.count('featureDivisionMembership')).toBe(0)
    expect(s.count('featureDivisionJob')).toBe(1)
    expect(
      s.sqlite.prepare('SELECT appliedRelease FROM divisionRefresh').get()
        ?.appliedRelease,
    ).toBeNull()
    await s.tick(async () => Response.json(geocoded()))
    expect(s.count('featureDivisionJob')).toBe(0)
  })

  it('keeps failed jobs durable and does not publish the target', async () => {
    const s = setup()
    s.add('a')
    await s.tick(async () => Response.json(geocoded()))
    await s.tick(async () => new Response('', { status: 503 }))
    expect(
      s.sqlite.prepare('SELECT attempts,retryAt FROM featureDivisionJob').get(),
    ).toMatchObject({ attempts: 1, retryAt: now + 30000 })
    expect(
      s.sqlite.prepare('SELECT appliedRelease FROM divisionRefresh').get()
        ?.appliedRelease,
    ).toBeNull()
  })

  it('fences an expired owner even after an upstream response arrives', async () => {
    const s = setup()
    s.add('a')
    await s.tick(async () => Response.json(geocoded()))
    await s.tick(async () => {
      s.sqlite.exec("UPDATE divisionRefresh SET lease='new-owner'")
      return Response.json(geocoded())
    })
    expect(s.count('featureDivisionMembership')).toBe(0)
    expect(s.sqlite.prepare('SELECT lease FROM divisionRefresh').get()?.lease).toBe(
      'new-owner',
    )
  })

  it('rolls back count deltas when membership publication fails', async () => {
    const s = setup()
    s.add('a')
    await s.tick(async () => Response.json(geocoded()))
    s.sqlite.exec(`CREATE TRIGGER reject_resolution BEFORE INSERT ON featureDivisionMembership
      BEGIN SELECT RAISE(ABORT,'injected'); END;`)
    await s.tick(async () => Response.json(geocoded()))
    expect(
      s.sqlite
        .prepare(
          "SELECT count(*) AS n FROM featureCountRollup WHERE divisionLeafId != ''",
        )
        .get()?.n,
    ).toBe(0)
    expect(s.count('featureDivisionJob')).toBe(1)
  })

  it('stores ambiguity without selecting both branches', async () => {
    const s = setup()
    s.add('a')
    await s.tick(async () => Response.json(geocoded()))
    const response = geocoded(['one', 'two'])
    await s.tick(async () =>
      Response.json({
        ...response,
        data: [{ ...response.data[0], attributes: { status: 'ambiguous' } }],
      }),
    )
    expect(s.count('featureDivisionMembership')).toBe(2)
    expect(
      s.sqlite
        .prepare(
          "SELECT count(*) AS n FROM featureCountRollup WHERE divisionLeafId != ''",
        )
        .get()?.n,
    ).toBe(0)
    expect(s.count('featureDivisionJob')).toBe(0)
  })

  it('prefers the administrative level-one branch while retaining every membership', async () => {
    const s = setup()
    s.add('a')
    const response = geocoded([
      'root',
      'area',
      'city',
      'district',
      'town',
      'macro',
      'hood',
      'micro',
      'group',
      'island',
    ])
    const attributes = [
      ['administrative', 'sar', 0],
      ['administrative', 'area', 1],
      ['locality', 'city', 1],
      ['administrative', 'district', 2],
      ['locality', 'town', 3],
      ['hood', 'macrohood', 4],
      ['hood', 'neighbourhood', 5],
      ['hood', 'microhood', 6],
      ['landform', 'island_group', null],
      ['landform', 'major_island', null],
    ]
    response.included.forEach((resource, index) => {
      Object.assign(resource.attributes, {
        category: attributes[index][0],
        class: attributes[index][1],
        level: attributes[index][2],
      })
    })
    Object.assign(response.data[0].relationships, {
      landform: { data: ['group', 'island'].map(id => ({ type: 'divisions', id })) },
    })
    const fetcher = async () => Response.json(response)
    await s.tick(fetcher)
    await s.tick(fetcher)
    expect(
      s.sqlite
        .prepare(
          'SELECT divisionLeafId,divisionLevel1Id,divisionLevel2Id,divisionLevel6Id,landformLeafId FROM feature',
        )
        .get(),
    ).toMatchObject({
      divisionLeafId: 'micro',
      divisionLevel1Id: 'area',
      divisionLevel2Id: 'district',
      divisionLevel6Id: 'micro',
      landformLeafId: 'island',
    })
    expect(s.count('featureDivisionMembership')).toBe(10)
    expect(
      s.sqlite.prepare('SELECT neighbourhood FROM featureNeighbourhood').get()
        ?.neighbourhood,
    ).toBe('hood')
    expect(
      s.sqlite
        .prepare(
          "SELECT selected FROM featureDivisionMembership WHERE featureId='a' AND divisionId='city'",
        )
        .get()?.selected,
    ).toBe(0)
    expect(s.count('divisionI18n')).toBe(10)
    expect(
      s.sqlite.prepare('SELECT sum(totalCount) AS n FROM featureCountRollup').get()?.n,
    ).toBe(1)
    s.sqlite.exec(
      `UPDATE feature SET geometry='{"type":"Point","coordinates":[20,20]}'`,
    )
    expect(
      s.sqlite
        .prepare('SELECT divisionLeafId,divisionLevel6Id,landformLeafId FROM feature')
        .get(),
    ).toMatchObject({
      divisionLeafId: null,
      divisionLevel6Id: null,
      landformLeafId: null,
    })
    expect(s.count('featureDivisionMembership')).toBe(0)
  })

  it('refreshes used names and variants without geocoding or mirroring unused divisions', async () => {
    const s = setup()
    s.add('a')
    await s.tick(async () => Response.json(geocoded(['village'], 'r1')))
    await s.tick(async () => Response.json(geocoded(['village'], 'r1')))
    s.sqlite.exec("UPDATE divisionRefresh SET phase='changes'")
    const renamed = change({
      canAffectGeocodingMembership: false,
      after: {
        ...definition(),
        attributes: {
          ...member('village'),
          names: {
            en: { name: 'New name', nameAlts: ['Alias'] },
            'zh-hant': { name: '新名' },
          },
        },
      },
    })
    const unused = change({
      id: 'unused-change',
      divisionId: 'unused',
      canAffectGeocodingMembership: false,
    })
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(page([renamed, unused])),
    )
    await s.tick(fetcher)
    for (let index = 0; index < 4; index++) await s.tick(fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(s.count('divisionDefinition')).toBe(1)
    expect(
      s.sqlite
        .prepare("SELECT name,namedValues FROM divisionI18n WHERE locale='en'")
        .get(),
    ).toMatchObject({
      name: 'New name',
      namedValues: JSON.stringify({ name: 'New name', nameAlts: ['Alias'] }),
    })
    expect(
      s.sqlite.prepare('SELECT neighbourhood FROM featureNeighbourhood').get()
        ?.neighbourhood,
    ).toBe('New name')
  })

  it('includes polygon boundaries and excludes hole interiors', () => {
    const geometry = polygonSchema.parse({
      ...polygon,
      coordinates: [
        ...polygon.coordinates,
        [
          [2, 2],
          [4, 2],
          [4, 4],
          [2, 4],
          [2, 2],
        ],
      ],
    })
    expect(covers([0, 5], geometry)).toBe(true)
    expect(covers([3, 3], geometry)).toBe(false)
    expect(covers([2, 3], geometry)).toBe(true)
    expect(covers([8, 8], geometry)).toBe(true)
    expect(covers([20, 20], geometry)).toBe(false)
  })
})
