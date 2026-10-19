// NODE
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
// TESTING
import { describe, expect, it, vi } from 'vitest'
// ROUTING
import { refreshFeatureMtr, type MtrEnvironment } from '../lib/routing/mtr-refresh'

const calculate = vi.hoisted(() => vi.fn())
vi.mock('../lib/routing/mtr', () => ({
  calculateMtrAccess: calculate,
  mtrFeaturePoint: () => [114.17, 22.3],
  mtrRouteDistance: () => 20,
}))

/** Builds a transactional D1 adapter over real SQLite for lease and trigger checks. */
function fixture(): { db: DatabaseSync; env: MtrEnvironment } {
  const db = new DatabaseSync(':memory:')
  db.exec(
    `PRAGMA foreign_keys=ON;CREATE TABLE feature(id TEXT PRIMARY KEY,geometry TEXT);INSERT INTO feature VALUES ('a','{"type":"Point","coordinates":[114.17,22.3]}');`,
  )
  db.exec(readFileSync('migrations/0096_feature_mtr_access.sql', 'utf8'))
  const prepare = (sql: string) => {
    let values: (string | number | null)[] = []
    return {
      bind(...args: (string | number | null)[]) {
        values = args
        return this
      },
      async first() {
        return db.prepare(sql).get(...values) ?? null
      },
      async run() {
        return db.prepare(sql).run(...values)
      },
    }
  }
  const session = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      db.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.run())
        db.exec('COMMIT')
        return results
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
  }
  const env = {
    DB: { withSession: () => session },
    ROUTING_TOKEN: 'test',
    ROUTING_SERVICE: {
      fetch: async () => new Response(JSON.stringify({ graphSha256: 'graph' })),
    },
  } as unknown as MtrEnvironment
  return { db, env }
}
const ready = {
  mtrStation: 'ADM',
  mtrExit: 'exit',
  mtrDistance: 20,
  mtrResolution: { status: 'ready' },
}

describe('durable MTR refresh', () => {
  it('atomically stores completed results and clears work', async () => {
    const { db, env } = fixture()
    try {
      calculate.mockResolvedValueOnce(ready)
      expect(await refreshFeatureMtr(env)).toBe('completed')
      expect(db.prepare('SELECT mtrStation FROM feature').get()?.mtrStation).toBe('ADM')
      expect(db.prepare('SELECT count(*) n FROM featureMtrJob').get()?.n).toBe(0)
    } finally {
      db.close()
    }
  })
  it('retains failed work with retry backoff', async () => {
    const { db, env } = fixture()
    try {
      calculate.mockRejectedValueOnce(new Error('engine unavailable'))
      expect(await refreshFeatureMtr(env)).toBe('retry')
      const job = db.prepare('SELECT * FROM featureMtrJob').get()!
      expect(job.leaseUntil).toBe(0)
      expect(Number(job.retryAt)).toBeGreaterThan(Date.now())
      expect(job.lastError).toBe('ROUTING_RETRY')
      expect(await refreshFeatureMtr(env)).toBe('idle')
    } finally {
      db.close()
    }
  })
  it('does not overwrite a concurrent coordinate edit or delete its new job', async () => {
    const { db, env } = fixture()
    try {
      calculate.mockImplementationOnce(async () => {
        db.exec(
          `UPDATE feature SET geometry='{"type":"Point","coordinates":[114.18,22.3]}'`,
        )
        return ready
      })
      await refreshFeatureMtr(env)
      expect(db.prepare('SELECT mtrStation FROM feature').get()?.mtrStation).toBeNull()
      expect(db.prepare('SELECT attempts,leaseUntil FROM featureMtrJob').get()).toEqual(
        { attempts: 0, leaseUntil: 0 },
      )
    } finally {
      db.close()
    }
  })
})
