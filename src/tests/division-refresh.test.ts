// @vitest-environment node
// NODE
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
// VITEST
import { afterEach, describe, expect, it, vi } from 'vitest'
// DRIZZLE
import { getTableColumns } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { feature } from '#lib/db/schema/feature.js'
import { FeatureInsert } from '#lib/db/zod/schema/feature.js'
import {
  createFeature,
  updateFeatureByIdWithConcurrency,
} from '#lib/db/services/feature.js'
import type { Database } from '#lib/types.js'
// SERVICES
import { refreshDivisions } from '../../workers/division-refresh/src/refresh'
import {
  apiRead,
  covers,
  geocodeSchema,
  changesSchema,
  divisionMetadataSchema,
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
      hierarchies: { full: [] },
      geometry: polygon,
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
    membershipGeometry: 'saanseoi',
  },
})

/** Runs production statements and atomic D1 batches against real SQLite. */
function setup(catalogueComplete = true) {
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
    '0084_division_facets',
    '0088_feature_division_roles',
    '0208_complete_division_catalogue',
  ])
    sqlite.exec(readFileSync(`migrations/${migration}.sql`, 'utf8'))
  const prepare = (sql: string, values: unknown[] = []) => ({
    bind: (...args: unknown[]) => prepare(sql, args),
    first: async () => sqlite.prepare(sql).get(...(values as never[])) ?? null,
    raw: async () =>
      sqlite
        .prepare(sql)
        .all(...(values as never[]))
        .map(row => Object.values(row)),
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
  const tick = (
    fetcher: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
  ) => {
    // These membership tests assume catalogue sync has completed; integration cases opt out.
    if (catalogueComplete)
      sqlite.exec(
        `UPDATE divisionRefresh SET catalogueRelease=coalesce(targetRelease,appliedRelease,'r2')`,
      )
    return refreshDivisions(db, { baseUrl: 'https://api.saanseoi.hk', fetcher }, now)
  }
  const count = (table: string) =>
    Number(sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n)
  return { sqlite, db, add, tick, count }
}

/** Small public catalogue with independently linked territory resources. */
function cataloguePage(offset = 0, total = 12, release = 'r2') {
  const ids = Array.from(
    { length: Math.min(10, total - offset) },
    (_, i) => `hood-${offset + i}`,
  )
  return {
    data: ids.map(id => ({
      type: 'divisions',
      id,
      attributes: {
        class: 'neighbourhood',
        category: 'hood',
        level: 5,
        i18n: { en: { name: id } },
        hierarchies: { full: [] },
        geometry: { type: 'Point', coordinates: [50, 50] },
      },
      relationships: {
        areas: { data: [{ type: 'division-areas', id: `area-${id}` }] },
      },
    })),
    included: ids.map(id => ({
      type: 'division-areas',
      id: `area-${id}`,
      attributes: {
        divisionId: id,
        variant: 'saanseoi',
        geometry: polygon,
      },
    })),
    meta: {
      apiReleaseSet: release,
      apiCatalogRevision: 'catalogue-1',
      schemaVersion: 'sv-division-v1',
      inventory: 'saanseoi',
      domain: 'geographic',
      page: { limit: 10, offset, total },
    },
  }
}

describe('complete division catalogue', () => {
  it('publishes all pages without Features and keeps unused definitions through refresh', async () => {
    const s = setup(false)
    s.sqlite.exec(
      "UPDATE divisionRefresh SET appliedRelease='r2',checkedMonth='2026-09'",
    )
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input))
      expect(url.searchParams.get('releaseSet')).toBe('r2')
      expect(url.searchParams.get('include')).toBe('areas:saanseoi')
      const offset = Number(url.searchParams.get('page[offset]'))
      if (offset) expect(url.searchParams.get('catalogRevision')).toBe('catalogue-1')
      return Response.json(cataloguePage(offset))
    })
    await s.tick(fetcher) // initialize
    await s.tick(fetcher) // first page
    expect(s.count('divisionDefinition')).toBe(0)
    expect(s.count('divisionCatalogueStage')).toBe(10)
    await s.tick(fetcher) // last page remains private
    expect(s.count('divisionDefinition')).toBe(0)
    await s.tick(fetcher) // publish
    expect(s.count('divisionDefinition')).toBe(12)
    expect(s.count('divisionI18n')).toBe(12)
    expect(s.count('divisionCatalogueStage')).toBe(0)
    const attributes = JSON.parse(
      s.sqlite
        .prepare("SELECT attributes FROM divisionDefinition WHERE id='hood-0'")
        .get()?.attributes as string,
    )
    expect(attributes.membershipGeometry).toEqual([{ geometry: polygon }])
    s.sqlite.exec("UPDATE divisionRefresh SET targetRelease='r2',phase='geocode'")
    await s.tick(fetcher)
    expect(s.count('divisionDefinition')).toBe(12)
    expect(s.count('featureDivisionMembership')).toBe(0)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('resumes failed final publication atomically without refetching or losing old references', async () => {
    const s = setup(false)
    s.sqlite.exec(`UPDATE divisionRefresh SET appliedRelease='r2',catalogueRelease='r1',checkedMonth='2026-09';
      INSERT INTO divisionDefinition VALUES('retired','r1','{"class":"neighbourhood","names":{}}');`)
    const fetcher = vi.fn(async () => Response.json(cataloguePage(0, 1)))
    await s.tick(fetcher)
    await s.tick(fetcher)
    s.sqlite.exec(
      `CREATE TRIGGER reject_catalogue BEFORE INSERT ON divisionDefinition BEGIN SELECT RAISE(ABORT,'injected'); END;`,
    )
    await expect(s.tick(fetcher)).rejects.toThrow('injected')
    expect(s.count('divisionDefinition')).toBe(1)
    expect(
      s.sqlite.prepare('SELECT catalogueRelease FROM divisionRefresh').get()
        ?.catalogueRelease,
    ).toBe('r1')
    s.sqlite.exec('DROP TRIGGER reject_catalogue')
    await s.tick(fetcher)
    expect(s.count('divisionDefinition')).toBe(2)
    expect(
      s.sqlite.prepare('SELECT catalogueRelease FROM divisionRefresh').get()
        ?.catalogueRelease,
    ).toBe('r2')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each(['release', 'total', 'offset', 'area', 'duplicate', 'revision'])(
    'rejects invalid %s pages without advancing',
    async kind => {
      const s = setup(false)
      s.sqlite.exec(
        "UPDATE divisionRefresh SET appliedRelease='r2',checkedMonth='2026-09'",
      )
      await s.tick(async () => {
        throw new Error('unexpected fetch')
      })
      await s.tick(async () => Response.json(cataloguePage()))
      const next = cataloguePage(10)
      if (kind === 'release') next.meta.apiReleaseSet = 'r3'
      if (kind === 'revision') next.meta.apiCatalogRevision = 'catalogue-2'
      if (kind === 'total') next.meta.page.total = 13
      if (kind === 'offset') next.meta.page.offset = 0
      if (kind === 'area') next.included = []
      if (kind === 'duplicate') {
        next.data[1] = next.data[0]
        next.included[1] = next.included[0]
      }
      await expect(s.tick(async () => Response.json(next))).rejects.toThrow()
      expect(s.count('divisionDefinition')).toBe(0)
      expect(s.count('divisionCatalogueStage')).toBe(10)
      expect(
        s.sqlite.prepare('SELECT catalogueOffset FROM divisionRefresh').get()
          ?.catalogueOffset,
      ).toBe(10)
    },
  )

  it('retains point-only definitions without inventing polygon territory', async () => {
    const s = setup(false)
    s.sqlite.exec(
      "UPDATE divisionRefresh SET appliedRelease='r2',checkedMonth='2026-09'",
    )
    const page = cataloguePage(0, 1)
    const pointOnly = {
      ...page,
      included: undefined,
      data: page.data.map(row => ({ ...row, relationships: {} })),
    }
    await s.tick(async () => Response.json(pointOnly))
    await s.tick(async () => Response.json(pointOnly))
    await s.tick(async () => Response.json(pointOnly))
    const attributes = JSON.parse(
      s.sqlite.prepare('SELECT attributes FROM divisionDefinition').get()
        ?.attributes as string,
    )
    expect(attributes.membershipGeometry).toEqual([])
    expect(attributes.membershipGeometryExternal).toBe(false)
  })

  it('publishes oversized MultiPolygons in bounded exact parts', async () => {
    const s = setup(false)
    s.sqlite.exec(
      "UPDATE divisionRefresh SET appliedRelease='r2',checkedMonth='2026-09'",
    )
    const ring = Array.from({ length: 16000 }, (_, i) => [
      114 + i / 100000,
      22 + i / 100000,
    ])
    ring.push(ring[0])
    const geometry = {
      type: 'MultiPolygon',
      coordinates: Array.from({ length: 6 }, () => [ring]),
    }
    const page = cataloguePage(0, 1)
    const large = {
      ...page,
      included: page.included.map(row => ({
        ...row,
        attributes: { ...row.attributes, geometry },
      })),
    }
    await s.tick(async () => Response.json(large))
    await s.tick(async () => Response.json(large))
    expect(s.count('divisionGeometryPart')).toBe(0)
    expect(s.count('divisionGeometryStage')).toBeGreaterThan(1)
    await s.tick(async () => Response.json(large))
    const attributes = JSON.parse(
      s.sqlite.prepare('SELECT attributes FROM divisionDefinition').get()
        ?.attributes as string,
    )
    expect(attributes.membershipGeometry).toEqual([])
    expect(attributes.membershipGeometryExternal).toBe(true)
    const parts = s.sqlite
      .prepare('SELECT geometries FROM divisionGeometryPart ORDER BY part')
      .all()
    for (const part of parts)
      expect(Buffer.byteLength(part.geometries as string)).toBeLessThanOrEqual(
        1_500_000,
      )
    expect(
      parts.flatMap(part =>
        JSON.parse(part.geometries as string).map(
          (polygon: { coordinates: number[][][] }) => polygon.coordinates,
        ),
      ),
    ).toEqual(geometry.coordinates)
    expect(s.count('divisionGeometryStage')).toBe(0)
  })

  it('fences catalogue pages when lease ownership changes during the API request', async () => {
    const s = setup(false)
    s.sqlite.exec(
      "UPDATE divisionRefresh SET appliedRelease='r2',checkedMonth='2026-09'",
    )
    await s.tick(async () => {
      throw new Error('unexpected fetch')
    })
    await s.tick(async () => {
      s.sqlite.exec("UPDATE divisionRefresh SET lease='other-owner'")
      return Response.json(cataloguePage())
    })
    expect(s.count('divisionCatalogueStage')).toBe(0)
    expect(
      s.sqlite.prepare('SELECT catalogueOffset FROM divisionRefresh').get()
        ?.catalogueOffset,
    ).toBe(0)
  })
})

describe('division refresh', () => {
  it('maintains memberships through real feature creation and optimistic geometry writes', async () => {
    const s = setup()
    // Extend the migration fixture for all columns returned by the production write helpers.
    const columns = new Set(
      s.sqlite
        .prepare('PRAGMA table_info(feature)')
        .all()
        .map(row => row.name),
    )
    for (const column of Object.values(getTableColumns(feature)))
      if (!columns.has(column.name))
        s.sqlite.exec(
          `ALTER TABLE feature ADD COLUMN "${column.name}" ${column.getSQLType()}`,
        )
    const db = drizzle(s.db) as Database
    const created = await createFeature(
      db,
      FeatureInsert.parse({
        id: 'created',
        organisationId: 'org-1',
        projectId: 'project-1',
        layerId: 'layer-1',
        geometry: { type: 'Point', coordinates: [5, 5] },
      }),
    )
    expect(s.count('featureSpatial')).toBe(13)
    expect(s.count('featureDivisionJob')).toBe(1)
    const initialCells = s.sqlite
      .prepare('SELECT cell FROM featureSpatial ORDER BY resolution')
      .all()
    const fetcher = vi.fn<
      (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>
    >(async () => Response.json(geocoded()))
    await s.tick(fetcher)
    await s.tick(fetcher)
    expect(s.count('featureDivisionJob')).toBe(0)
    expect(s.count('featureDivisionMembership')).toBeGreaterThan(0)

    const moved = await updateFeatureByIdWithConcurrency(db, {
      id: created.id,
      updatedAt: created.modifiedAt,
      data: { geometry: { type: 'Point', coordinates: [6, 6] } },
    })
    expect(moved).toBeDefined()
    expect(s.count('featureSpatial')).toBe(13)
    expect(
      s.sqlite.prepare('SELECT cell FROM featureSpatial ORDER BY resolution').all(),
    ).not.toEqual(initialCells)
    expect(s.count('featureDivisionMembership')).toBe(0)
    expect(s.count('featureDivisionJob')).toBe(1)
    await s.tick(fetcher)
    expect(s.count('featureDivisionJob')).toBe(0)
    expect(s.count('featureDivisionMembership')).toBeGreaterThan(0)

    // A rejected stale edit must change neither index nor the completed division work.
    expect(
      await updateFeatureByIdWithConcurrency(db, {
        id: created.id,
        updatedAt: 'stale-version',
        data: { geometry: { type: 'Point', coordinates: [7, 7] } },
      }),
    ).toBeUndefined()
    expect(
      s.sqlite.prepare('SELECT DISTINCT longitude,latitude FROM featureSpatial').all(),
    ).toEqual([{ longitude: 6, latitude: 6 }])
    expect(s.count('featureDivisionJob')).toBe(0)
  })

  it('accepts current live changes and definition metadata independently of worker mocks', () => {
    const changes = changesSchema.parse(
      JSON.parse(
        readFileSync('src/tests/fixtures/saanseoi-changes-current.json', 'utf8'),
      ),
    )
    expect(changes.meta.membershipGeometry).toBe('saanseoi')
    expect(changes.meta.toApiReleaseSet.code).toBe('data-hk-divisions-2026-10-01.0')
    const metadata = divisionMetadataSchema.parse(
      JSON.parse(
        readFileSync('src/tests/fixtures/saanseoi-division-metadata.json', 'utf8'),
      ),
    )
    expect(metadata.data.attributes.divisionCode).toBe('CW')
    expect(metadata.meta.apiReleaseSet).toBe('data-hk-divisions-2026-10-01.0')
    expect(metadata.data.attributes.identifiers?.wikidata.id).toBe('Q312485')
    expect(metadata.data.attributes.hierarchies.administrative?.[0][0].class).toBe(
      'sar',
    )
  })

  it('enriches geocoding metadata once per mirrored release and retains polygon geometry', async () => {
    const s = setup()
    s.add('a')
    s.add('b')
    const response = geocoded()
    Reflect.deleteProperty(response.included[0].attributes, 'hierarchies')
    const fetcher = vi.fn<
      (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>
    >(async input => {
      const url = new URL(String(input))
      // An unavailable display-area variant must not block geocoder polygon enrichment.
      if (url.searchParams.get('include')?.includes('areas:'))
        return Response.json({ error: 'variant_unavailable' }, { status: 409 })
      if (url.pathname === '/divisions/v0.2/village') {
        expect(url.searchParams.get('releaseSet')).toBe('r2')
        expect(url.searchParams.get('include')).toBe('hierarchy')
        return Response.json({
          data: {
            type: 'divisions',
            id: 'village',
            attributes: {
              divisionCode: 'VIL',
              identifiers: { saanseoi: { sourceId: 'village-source' } },
              hierarchies: { full: [] },
            },
          },
          meta: { apiReleaseSet: 'r2', schemaVersion: 'sv-division-v1' },
        })
      }
      expect(url.pathname).toBe('/divisions/v0.2/geocode')
      expect(url.searchParams.get('geometry')).toBe('saanseoi')
      return Response.json(response)
    })
    await s.tick(fetcher)
    await s.tick(fetcher)
    const stored = JSON.parse(
      String(
        s.sqlite
          .prepare("SELECT attributes FROM divisionDefinition WHERE id='village'")
          .get()?.attributes,
      ),
    )
    expect(stored).toMatchObject({
      divisionCode: 'VIL',
      hierarchies: { full: [] },
      membershipGeometry: [{ geometry: polygon }],
    })
    expect(
      fetcher.mock.calls.filter(
        ([url]) => new URL(String(url)).pathname === '/divisions/v0.2/village',
      ),
    ).toHaveLength(1)
  })

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
    const fetcher = vi.fn<
      (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>
    >(async () => Response.json(geocoded()))
    await apiRead(
      { baseUrl: 'https://api.saanseoi.hk', token: 'test-key', fetcher },
      '/divisions/v0.2/geocode',
      { lat: '5', lng: '5', releaseSet: 'r2' },
      geocodeSchema,
    )
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      headers: { 'x-api-key': 'test-key' },
      redirect: 'manual',
    })
    expect(
      new URL(String(fetcher.mock.calls[0][0])).searchParams.get('releaseSet'),
    ).toBe('r2')
  })

  it('rejects redirects without forwarding the API credential', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://example.com/redirect' },
        }),
    )
    await expect(
      apiRead(
        { baseUrl: 'https://api.saanseoi.hk', token: 'test-key', fetcher },
        '/divisions/v0.2/geocode',
        {},
        geocodeSchema,
      ),
    ).rejects.toThrow('SAANSEOI_HTTP_302')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]).toBeDefined()
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
    const fetcher = vi.fn<
      (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>
    >(async () => Response.json(page([change({ type: 'addition', before: null })])))
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
    const fetcher = vi.fn<
      (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>
    >(async () => Response.json(geocoded()))
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
    const first = vi.fn<
      (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>
    >(async (url: URL | RequestInfo) =>
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
    const fetcher = vi.fn<
      (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>
    >(async (url: URL | RequestInfo) =>
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
    const fetcher = vi.fn<
      (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>
    >(async () =>
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
    const fetcher = vi.fn<
      (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>
    >(async () =>
      Response.json(page([change({ canAffectGeocodingMembership: false })], 'next')),
    )
    await s.tick(fetcher)
    await s.tick(fetcher)
    await s.tick(fetcher)
    fetcher.mockImplementation(async () => Response.json(page([], null)))
    await s.tick(fetcher)
    await s.tick(fetcher)
    const url = new URL(String(fetcher.mock.calls[1][0]))
    expect(url.searchParams.get('toReleaseSet')).toBe('r2')
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
          "SELECT count(*) AS n FROM featureCountRollup WHERE neighbourhoodId != ''",
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
      JSON.parse(
        s.sqlite.prepare('SELECT divisionResolution FROM feature').get()
          ?.divisionResolution as string,
      ),
    ).toEqual({
      status: 'ambiguous',
      branches: { hood: [['one', 'two']] },
    })
    expect(
      s.sqlite
        .prepare(
          "SELECT count(*) AS n FROM featureCountRollup WHERE neighbourhoodId != ''",
        )
        .get()?.n,
    ).toBe(0)
    expect(s.count('featureDivisionJob')).toBe(0)
  })

  it('preserves administrative and locality memberships at the same display level', async () => {
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
          'SELECT neighbourhoodId,areaId,districtId,microhoodId,islandId FROM feature',
        )
        .get(),
    ).toMatchObject({
      neighbourhoodId: 'hood',
      areaId: 'area',
      districtId: 'district',
      microhoodId: 'micro',
      islandId: 'island',
    })
    expect(s.count('featureDivisionMembership')).toBe(10)
    expect(
      s.sqlite
        .prepare(
          "SELECT name FROM divisionI18n WHERE divisionId='hood' AND locale='en'",
        )
        .get()?.name,
    ).toBe('hood')
    expect(
      s.sqlite
        .prepare(
          "SELECT selected FROM featureDivisionMembership WHERE featureId='a' AND divisionId='city'",
        )
        .get()?.selected,
    ).toBe(1)
    expect(s.count('divisionI18n')).toBe(10)
    expect(
      s.sqlite.prepare('SELECT sum(totalCount) AS n FROM featureCountRollup').get()?.n,
    ).toBe(1)
    s.sqlite.exec(
      `UPDATE feature SET geometry='{"type":"Point","coordinates":[20,20]}'`,
    )
    expect(
      s.sqlite
        .prepare('SELECT neighbourhoodId,microhoodId,islandId FROM feature')
        .get(),
    ).toMatchObject({
      neighbourhoodId: null,
      microhoodId: null,
      islandId: null,
    })
    expect(s.count('featureDivisionMembership')).toBe(0)
  })

  it('keeps change-feed metadata private until the complete catalogue is published', async () => {
    const s = setup()
    s.add('a')
    await s.tick(async () => Response.json(geocoded(['village'], 'r1')))
    await s.tick(async () => Response.json(geocoded(['village'], 'r1')))
    s.sqlite.exec("UPDATE divisionRefresh SET phase='changes'")
    await s.tick(async () =>
      Response.json(
        page([
          change({
            canAffectGeocodingMembership: false,
            after: {
              ...definition(),
              attributes: { ...member('village'), names: { en: { name: 'New name' } } },
            },
          }),
        ]),
      ),
    )
    expect(
      s.sqlite.prepare("SELECT name FROM divisionI18n WHERE locale='en'").get()?.name,
    ).toBe('village')
    expect(s.count('divisionRefreshChange')).toBe(1)
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
