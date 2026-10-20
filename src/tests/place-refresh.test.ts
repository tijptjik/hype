// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { refreshPlaces } from '#lib/places/refresh.js'
import type { D1Database } from '@cloudflare/workers-types'

const stores: DatabaseSync[] = []
afterEach(() => {
  for (const db of stores.splice(0)) db.close()
})
function publication() {
  const meta = {
    apiReleaseSet: 'release',
    apiCatalogRevision: 'catalog',
    catalogPublishedAt: '2026-10-18T00:00:00Z',
    cohort: '2026-09-23.0',
    resolvedApiVersion: 'api-places-v0.1',
    domain: 'overture',
    region: 'hk',
    schemaVersion: 'v1',
  }
  const query = new URLSearchParams({
    releaseSet: meta.apiReleaseSet,
    catalogRevision: meta.apiCatalogRevision,
    knownAt: meta.catalogPublishedAt,
    cohort: meta.cohort,
    domain: meta.domain,
  })
  return { meta, links: { permalink: `https://source.example/places/v0.1?${query}` } }
}
function page(ids = ['shop'], offset = 0, total = 1) {
  return {
    ...publication(),
    data: ids.map(id => ({
      type: 'places',
      id,
      attributes: {
        geometry: { type: 'Point', coordinates: [114, 22] },
        snapshotId: 'snapshot',
        resourceReleaseId: 'source-release',
        addressSnapshotId: null,
        address2dId: null,
        address3dId: null,
        address3dUnitId: null,
        phones: [],
        identifiers: null,
        i18n: { en: { name: 'Shop', brandName: null } },
      },
    })),
    meta: { ...publication().meta, page: { offset, limit: 100, total } },
  }
}
function setup(mode: 'catalogue' | 'identities' = 'catalogue') {
  const sqlite = new DatabaseSync(':memory:')
  stores.push(sqlite)
  sqlite.exec(`CREATE TABLE place(id TEXT PRIMARY KEY,ssId TEXT);
    CREATE TABLE featurePlace(featureId TEXT,placeId TEXT);
    INSERT INTO place VALUES('p','shop'),('missing','absent'),('unlinked','unused');
    INSERT INTO featurePlace VALUES('f','p'),('g','missing');`)
  sqlite.exec(readFileSync('migrations/0114_place_refresh.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0115_place_refresh_processing.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0119_place_source_changes.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0121_place_refresh_identity_scan.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0122_simplify_place_refresh.sql', 'utf8'))
  const prepare = (query: string, values: unknown[] = []) => ({
    bind: (...args: unknown[]) => prepare(query, args),
    first: async () => sqlite.prepare(query).get(...(values as never[])) ?? null,
    all: async () => ({
      results: sqlite.prepare(query).all(...(values as never[])),
      success: true,
    }),
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
        const result = []
        for (const s of statements) result.push(await s.run())
        sqlite.exec('COMMIT')
        return result
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  } as unknown as D1Database
  let now = Date.now()
  const request = vi.fn(async () => Response.json(publication()))
  const tick = async () => {
    const result = await refreshPlaces(
      db,
      {
        baseUrl: 'https://source.example',
        apiKey: 'fixture',
        fetch: request as unknown as typeof fetch,
      },
      () => now,
    )
    // Legacy scan tests model a catalogue run captured before migration 0121.
    if (result === 'started' && mode === 'catalogue')
      sqlite.exec(
        "UPDATE placeRefresh SET scanMode='catalogue',total=NULL,phase='scan'",
      )
    return result
  }
  const state = () => {
    const row = sqlite.prepare('SELECT * FROM placeRefresh').get()
    if (!row) throw new Error('Missing refresh state')
    return row
  }
  const items = () =>
    sqlite.prepare('SELECT * FROM placeRefreshItem ORDER BY placeId').all()
  return {
    sqlite,
    request,
    tick,
    state,
    items,
    advance: (ms: number) => {
      now += ms
    },
  }
}

describe('durable canonical Place scan', () => {
  it('snapshots linked Places, resumes the pinned scan and never claims adoption', async () => {
    const s = setup()
    expect(await s.tick()).toBe('started')
    expect(s.items().map(x => x.placeId)).toEqual(['missing', 'p'])
    s.request.mockImplementation(async () => Response.json(page(['other'], 0, 2)))
    expect(await s.tick()).toBe('scanned')
    expect(s.state().nextOffset).toBe(1)
    s.request.mockImplementation(async () => Response.json(page(['shop'], 1, 2)))
    await s.tick()
    expect(s.state()).toMatchObject({
      phase: 'ready',
      nextOffset: 2,
      accepted: null,
      lease: null,
    })
    expect(s.items().map(x => x.status)).toEqual(['missing', 'pending'])
    expect(await s.tick()).toBe('review')
    expect(s.request).toHaveBeenCalledTimes(3)
    const calls = s.request.mock.calls as unknown as [URL, RequestInit][]
    expect(calls[2][0].searchParams.get('knownAt')).toBe(
      publication().meta.catalogPublishedAt,
    )
    expect(calls[2][0].searchParams.get('page[offset]')).toBe('1')
  })
  it('rolls candidate writes back if checkpoint persistence fails', async () => {
    const s = setup()
    await s.tick()
    s.sqlite.exec(`CREATE TRIGGER fail_checkpoint BEFORE UPDATE OF nextOffset ON placeRefresh
      WHEN NEW.nextOffset>0 BEGIN SELECT RAISE(ABORT,'injected failure'); END;`)
    s.request.mockImplementation(async () => Response.json(page()))
    await expect(s.tick()).rejects.toThrow('injected failure')
    expect(s.state()).toMatchObject({
      phase: 'scan',
      nextOffset: 0,
      failures: 1,
      lastError: 'PLACE_REFRESH_STEP_FAILED',
    })
    expect(s.items().every(x => x.projection === null)).toBe(true)
    expect(await s.tick()).toBe('busy')
    s.advance(30_001)
    s.sqlite.exec('DROP TRIGGER fail_checkpoint')
    await s.tick()
    expect(s.state()).toMatchObject({ phase: 'ready', failures: 0, retryAt: 0 })
  })
  it('ignores expired network results and never releases a successor lease', async () => {
    const s = setup()
    await s.tick()
    s.request.mockImplementation(async () => {
      s.advance(240_001)
      s.sqlite.exec(
        "UPDATE placeRefresh SET lease='successor',leaseUntil=9999999999999",
      )
      return Response.json(page())
    })
    expect(await s.tick()).toBe('superseded')
    expect(s.state()).toMatchObject({
      phase: 'scan',
      nextOffset: 0,
      lease: 'successor',
    })
    expect(s.items().every(x => x.projection === null)).toBe(true)
  })
  it('rejects an expired result even before a successor takes ownership', async () => {
    const s = setup()
    await s.tick()
    s.request.mockImplementation(async () => {
      s.advance(240_001)
      return Response.json(page())
    })
    expect(await s.tick()).toBe('superseded')
    expect(s.state().nextOffset).toBe(0)
    expect(s.items().every(x => x.projection === null)).toBe(true)
  })
  it('holds duplicate tracked IDs across pages and changed totals without advancing', async () => {
    const s = setup()
    await s.tick()
    s.request.mockImplementation(async () => Response.json(page(['shop'], 0, 2)))
    await s.tick()
    s.request.mockImplementation(async () => Response.json(page(['shop'], 1, 2)))
    await expect(s.tick()).rejects.toThrow('DUPLICATE_SOURCE')
    expect(s.state().nextOffset).toBe(1)
    s.advance(30_001)
    s.request.mockImplementation(async () => Response.json(page(['other'], 1, 3)))
    await expect(s.tick()).rejects.toThrow('TOTAL_CHANGED')
    expect(s.state().nextOffset).toBe(1)
  })
  it('checks an unchanged publication once per UTC month', async () => {
    const s = setup()
    await s.tick()
    s.sqlite.exec(
      "UPDATE placeRefresh SET accepted=target,phase='idle',checkedMonth=NULL",
    )
    expect(await s.tick()).toBe('unchanged')
    expect(await s.tick()).toBe('idle')
    expect(s.request).toHaveBeenCalledTimes(2)
    s.advance(32 * 86400000)
    expect(await s.tick()).toBe('unchanged')
    expect(s.request).toHaveBeenCalledTimes(3)
  })
  it('retries failed discovery without marking the month checked', async () => {
    const s = setup()
    s.request.mockImplementation(
      async () => new Response('unavailable', { status: 503 }),
    )
    await expect(s.tick()).rejects.toThrow('(503)')
    expect(s.state()).toMatchObject({
      phase: 'idle',
      checkedMonth: null,
      accepted: null,
      target: null,
    })
    expect(s.items()).toHaveLength(0)
    expect(await s.tick()).toBe('busy')
    s.advance(30_001)
    s.request.mockImplementation(async () => Response.json(publication()))
    expect(await s.tick()).toBe('started')
  })
  it('retains the accepted publication when current discovery regresses', async () => {
    const s = setup()
    await s.tick()
    const accepted = JSON.parse(String(s.state().target))
    accepted.publishedAt = '2026-10-19T00:00:00Z'
    accepted.pin.knownAt = accepted.publishedAt
    accepted.pin.catalogRevision = 'newer-catalog'
    s.sqlite
      .prepare("UPDATE placeRefresh SET accepted=?,phase='idle',checkedMonth=NULL")
      .run(JSON.stringify(accepted))
    expect(await s.tick()).toBe('review')
    expect(JSON.parse(String(s.state().accepted))).toEqual(accepted)
    expect(await s.tick()).toBe('review')
    expect(s.request).toHaveBeenCalledTimes(2)
  })
  it('an empty ready catalogue preserves missing identities without deleting anything', async () => {
    const s = setup()
    await s.tick()
    s.request.mockImplementation(async () => Response.json(page([], 0, 0)))
    await s.tick()
    expect(s.state()).toMatchObject({ phase: 'ready', total: 0, accepted: null })
    expect(s.items().map(item => item.status)).toEqual(['missing', 'missing'])
    expect(
      s.sqlite.prepare('SELECT count(*) AS count FROM featurePlace').get()?.count,
    ).toBe(2)
  })
})

describe('captured identity refresh scans', () => {
  function exact(id: string, found = true) {
    const result = page(found ? [id] : [], 0, found ? 1 : 0)
    return { ...result, meta: { ...result.meta, filters: { id } } }
  }

  it('reads every linked ID once with its publication pin, retaining explicit absence', async () => {
    const s = setup('identities')
    expect(await s.tick()).toBe('started')
    expect(s.state()).toMatchObject({ scanMode: 'identities', total: 2, nextOffset: 0 })
    s.sqlite.exec("INSERT INTO featurePlace VALUES('later','unlinked')")
    s.request.mockImplementation(async () => Response.json(exact('absent', false)))
    expect(await s.tick()).toBe('scanned')
    expect(s.state()).toMatchObject({ phase: 'scan', nextOffset: 1 })
    expect(s.items()[0]).toMatchObject({ sourceOffset: 0, status: 'missing' })
    s.request.mockImplementation(async () => Response.json(exact('shop')))
    expect(await s.tick()).toBe('scanned')
    expect(s.state()).toMatchObject({
      phase: 'ready',
      nextOffset: 2,
      total: 2,
      accepted: null,
    })
    expect(s.items()[1]).toMatchObject({ sourceOffset: 1, status: 'pending' })
    const calls = s.request.mock.calls as unknown as [URL, RequestInit][]
    expect(calls.slice(1).map(([url]) => url.searchParams.get('filter[id]'))).toEqual([
      'absent',
      'shop',
    ])
    expect(
      calls
        .slice(1)
        .every(
          ([url]) =>
            url.searchParams.get('knownAt') === publication().meta.catalogPublishedAt,
        ),
    ).toBe(true)
    expect(s.request).toHaveBeenCalledTimes(3)
  })

  it('preserves an in-flight catalogue cursor when installing migration 0121', () => {
    const sqlite = new DatabaseSync(':memory:')
    stores.push(sqlite)
    sqlite.exec(readFileSync('migrations/0114_place_refresh.sql', 'utf8'))
    sqlite.exec(
      "UPDATE placeRefresh SET phase='scan',runId='existing',nextOffset=12300,total=139522",
    )
    const before = sqlite.prepare('SELECT * FROM placeRefresh').get()
    sqlite.exec(readFileSync('migrations/0121_place_refresh_identity_scan.sql', 'utf8'))
    expect(sqlite.prepare('SELECT * FROM placeRefresh').get()).toEqual({
      ...before,
      scanMode: 'catalogue',
    })
  })

  it('skips catalogue reads when no Places have linked Features', async () => {
    const s = setup('identities')
    s.sqlite.exec('DELETE FROM featurePlace')
    expect(await s.tick()).toBe('started')
    expect(s.state()).toMatchObject({ phase: 'ready', total: 0, nextOffset: 0 })
    expect(await s.tick()).toBe('complete')
    expect(s.request).toHaveBeenCalledTimes(1)
  })

  it.each(['ignored', 'wrong-id', 'multiple'])(
    'rejects %s ID selection without advancing',
    async mode => {
      const s = setup('identities')
      await s.tick()
      const response =
        mode === 'ignored'
          ? page()
          : {
              ...exact('absent'),
              data: page(mode === 'wrong-id' ? ['shop'] : ['absent', 'shop'], 0, 2)
                .data,
            }
      s.request.mockImplementation(async () => Response.json(response))
      await expect(s.tick()).rejects.toThrow()
      expect(s.state()).toMatchObject({ nextOffset: 0, failures: 1 })
      expect(s.items().every(item => item.sourceOffset === null)).toBe(true)
    },
  )

  it('rolls a found identity back when its checkpoint fails and retries the same ID', async () => {
    const s = setup('identities')
    await s.tick()
    s.sqlite.exec(`CREATE TRIGGER fail_identity_checkpoint BEFORE UPDATE OF nextOffset ON placeRefresh
      WHEN NEW.nextOffset>0 BEGIN SELECT RAISE(ABORT,'checkpoint failure'); END`)
    s.request.mockImplementation(async () => Response.json(exact('absent')))
    await expect(s.tick()).rejects.toThrow('checkpoint failure')
    expect(
      s.items().every(item => item.sourceOffset === null && item.projection === null),
    ).toBe(true)
    s.sqlite.exec('DROP TRIGGER fail_identity_checkpoint')
    s.advance(30_001)
    expect(await s.tick()).toBe('scanned')
    expect(s.state().nextOffset).toBe(1)
  })

  it('rejects expired identity reads without losing the successor lease', async () => {
    const s = setup('identities')
    await s.tick()
    s.request.mockImplementation(async () => {
      s.advance(240_001)
      s.sqlite.exec(
        "UPDATE placeRefresh SET lease='successor',leaseUntil=9999999999999",
      )
      return Response.json(exact('absent'))
    })
    expect(await s.tick()).toBe('superseded')
    expect(s.state()).toMatchObject({ nextOffset: 0, lease: 'successor' })
    expect(s.items().every(item => item.sourceOffset === null)).toBe(true)
  })
})
