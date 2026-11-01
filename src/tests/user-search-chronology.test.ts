// @vitest-environment node
// NODE
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
// DRIZZLE
import { drizzle } from 'drizzle-orm/sqlite-proxy'
// TESTS
import { describe, expect, it } from 'vitest'
// SERVICES
import { searchUsersByConditions } from '#lib/db/services/user.js'
// TYPES
import type { Database } from '#lib/types.js'

const repairSql = readFileSync('migrations/0159_user_numeric_timestamps.sql', 'utf8')

describe('user directory numeric timestamp repair', () => {
  it.each(['createdAt', 'updatedAt'] as const)(
    'repairs ISO dates once and sorts numeric %s values across pages',
    async sortBy => {
      const sqlite = new DatabaseSync(':memory:')
      try {
        sqlite.exec(`CREATE TABLE user (
          id TEXT, name TEXT, username TEXT, displayUsername TEXT, email TEXT,
          telephone TEXT, image TEXT, attribution TEXT, locale TEXT,
          isArchived INTEGER, createdAt INTEGER, updatedAt INTEGER
        )`)
        const dates = [
          ['old-numeric', Date.parse('2024-12-09T14:18:29.910Z')],
          ['legacy-iso', '2026-06-04T22:46:32.608Z'],
          ['recent-a', Date.parse('2026-11-01T13:56:00.123Z')],
          ['recent-b', Date.parse('2026-11-01T13:56:00.123Z')],
        ] as const
        for (const [id, timestamp] of dates) {
          sqlite
            .prepare('INSERT INTO user (id, createdAt, updatedAt) VALUES (?, ?, ?)')
            .run(id, timestamp, timestamp)
        }
        sqlite.exec(repairSql)
        const repaired = sqlite.prepare('SELECT * FROM user ORDER BY id').all()
        // The deployed migration may run after a direct repair and must be a no-op.
        sqlite.exec(repairSql)
        expect(sqlite.prepare('SELECT * FROM user ORDER BY id').all()).toEqual(repaired)
        expect(
          sqlite
            .prepare(
              "SELECT count(*) AS count FROM user WHERE typeof(createdAt) != 'integer' OR typeof(updatedAt) != 'integer'",
            )
            .get(),
        ).toEqual({ count: 0 })
        expect(
          sqlite.prepare("SELECT createdAt FROM user WHERE id = 'old-numeric'").get(),
        ).toEqual({ createdAt: dates[0][1] })
        const db = drizzle(async (query, params) => {
          const statement = sqlite.prepare(query)
          statement.setReturnArrays(true)
          return { rows: statement.all(...params) as unknown[][] }
        }) as unknown as Database
        const first = await searchUsersByConditions(db, {
          conditions: [],
          limit: 2,
          offset: 0,
          sortBy,
          sortOrder: 'desc',
        })
        expect(first.totalCount).toBe(4)
        expect(first.data.map(row => row.id)).toEqual(['recent-a', 'recent-b'])
        const second = await searchUsersByConditions(db, {
          conditions: [],
          limit: 2,
          offset: 2,
          sortBy,
          sortOrder: 'desc',
        })
        expect(second.data.map(row => row.id)).toEqual(['legacy-iso', 'old-numeric'])
        expect(second.data[0].createdAt.toISOString()).toBe('2026-06-04T22:46:32.608Z')
        const ascending = await searchUsersByConditions(db, {
          conditions: [],
          limit: 4,
          offset: 0,
          sortBy,
          sortOrder: 'asc',
        })
        expect(ascending.data.map(row => row.id)).toEqual([
          'old-numeric',
          'legacy-iso',
          'recent-a',
          'recent-b',
        ])
        // Directory reads now rely only on the repaired numeric storage.
        expect(
          sqlite
            .prepare(
              "SELECT typeof(createdAt) AS type FROM user WHERE id = 'legacy-iso'",
            )
            .get(),
        ).toEqual({ type: 'integer' })
      } finally {
        sqlite.close()
      }
    },
  )
})
