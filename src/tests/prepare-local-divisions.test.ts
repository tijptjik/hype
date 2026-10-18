// TESTS
import { describe, expect, it, vi } from 'vitest'
// SERVICES
import { prepareLocalDivisions } from '../../scripts/dev/prepare-divisions'
import { refreshDivisions } from '../../workers/division-refresh/src/refresh'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'

vi.mock('../../workers/division-refresh/src/refresh', () => ({
  refreshDivisions: vi.fn(),
}))

/** Creates a local queue snapshot that can advance after each simulated worker step. */
function fixture() {
  const state = {
    phase: 'idle',
    appliedRelease: 'current-release' as string | null,
    checkedMonth: new Date().toISOString().slice(0, 7),
  }
  const pending = { count: 0, ready: 0 }
  let failures: { featureId: string; generation: number; attempts: number }[] = []
  const db = {
    prepare: (sql: string) => ({
      bind() {
        return this
      },
      async first() {
        return sql.includes('divisionRefresh') ? { ...state } : { ...pending }
      },
      async all() {
        return { results: [...failures] }
      },
    }),
  } as unknown as D1Database
  return {
    db,
    state,
    pending,
    setFailures: (rows: typeof failures) => {
      failures = rows
    },
  }
}

describe('local mirror division preparation', () => {
  it('accepts a complete current-month checkpoint without credentials or API work', async () => {
    vi.mocked(refreshDivisions).mockReset()
    const { db } = fixture()
    await prepareLocalDivisions(db, {})
    expect(refreshDivisions).not.toHaveBeenCalled()
  })

  it('fails pending work without a server credential', async () => {
    const { db, pending } = fixture()
    Object.assign(pending, { count: 1, ready: 1 })
    await expect(prepareLocalDivisions(db, {})).rejects.toThrow('SAANSEOI_API_KEY')
  })

  it('drains queued jobs against the local Atlas origin', async () => {
    const { db, pending } = fixture()
    Object.assign(pending, { count: 1, ready: 1 })
    vi.mocked(refreshDivisions).mockImplementationOnce(async () => {
      Object.assign(pending, { count: 0, ready: 0 })
      return 'geocode'
    })
    await prepareLocalDivisions(db, { SAANSEOI_API_KEY: 'test-only' })
    expect(refreshDivisions).toHaveBeenLastCalledWith(db, {
      baseUrl: 'http://api.atlas.localhost',
      token: 'test-only',
    })
  })

  it('refuses to report deferred jobs as complete', async () => {
    const { db, pending } = fixture()
    Object.assign(pending, { count: 1, ready: 0 })
    await expect(prepareLocalDivisions(db, {})).rejects.toThrow('retryAt')
  })

  it('respects another refresh lease', async () => {
    const { db, pending } = fixture()
    Object.assign(pending, { count: 1, ready: 1 })
    vi.mocked(refreshDivisions).mockResolvedValueOnce('busy')
    await expect(
      prepareLocalDivisions(db, { SAANSEOI_API_KEY: 'test-only' }),
    ).rejects.toThrow('lease')
  })

  it('stops on newly failed jobs even when older failures have succeeded', async () => {
    const f = fixture()
    Object.assign(f.pending, { count: 2, ready: 2 })
    f.setFailures([{ featureId: 'old', generation: 1, attempts: 5 }])
    vi.mocked(refreshDivisions).mockImplementationOnce(async () => {
      f.setFailures([{ featureId: 'new', generation: 1, attempts: 1 }])
      return 'geocode'
    })
    await expect(
      prepareLocalDivisions(f.db, { SAANSEOI_API_KEY: 'test-only' }),
    ).rejects.toThrow('geocoding failed')
  })
})
