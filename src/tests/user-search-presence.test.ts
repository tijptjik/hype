// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { describe, expect, it } from 'vitest'
// SERVICES
import { toUserSearchQueryPlan } from '#lib/api/services/user.js'
import { searchUsersByConditions } from '#lib/db/services/user.js'
import { UserSearchQueryParamsSchema } from '#lib/db/zod/schema/user.js'
// TYPES
import type { Database } from '#lib/types.js'

describe('contact-presence search', () => {
  it('combines contact presence, text, archived state and paging with accurate counts', async () => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      sqlite.exec(`CREATE TABLE user (
        id TEXT, name TEXT, username TEXT, displayUsername TEXT, email TEXT,
        telephone TEXT, image TEXT, attribution TEXT, locale TEXT, emailVerified INTEGER,
        isArchived INTEGER, createdAt INTEGER, updatedAt INTEGER
      );
      INSERT INTO user (id,name,email,telephone,isArchived) VALUES
        ('both','A Both','a@example.invalid','123',0),
        ('email','B Email','b@example.invalid','',0),
        ('phone','C Phone',NULL,'456',0),
        ('blank','D Blank','   ','   ',0),
        ('missing','E Missing',NULL,NULL,0),
        ('archived','F Archived','f@example.invalid','789',1);`)
      const db = drizzle(async (query, params) => {
        const statement = sqlite.prepare(query)
        statement.setReturnArrays(true)
        return { rows: statement.all(...params) as unknown as unknown[][] }
      }) as unknown as Database
      const search = async (input: unknown) => {
        const params = UserSearchQueryParamsSchema.parse(input)
        const plan = await toUserSearchQueryPlan(db, params)
        return searchUsersByConditions(db, plan)
      }
      const both = await search({ conditions: { hasEmail: true, hasTelephone: true } })
      expect(both.data.map(row => row.id)).toEqual(['both'])
      expect(both.totalCount).toBe(1)
      const noPhone = await search({
        conditions: { hasTelephone: false },
        pagination: { limit: 1, offset: 1 },
      })
      expect(noPhone.totalCount).toBe(3)
      expect(noPhone.data.map(row => row.id)).toEqual(['blank'])
      const noEmail = await search({ conditions: { hasEmail: false } })
      expect(noEmail.data.map(row => row.id)).toEqual(['phone', 'blank', 'missing'])
      expect(
        (await search({ conditions: { hasEmail: null, hasTelephone: null } }))
          .totalCount,
      ).toBe(5)
      expect(
        (
          await search({ q: 'A@EXAMPLE.INVALID', conditions: { hasTelephone: true } })
        ).data.map(row => row.id),
      ).toEqual(['both'])
      expect(
        (
          await search({
            conditions: { isArchived: true, hasEmail: true, hasTelephone: true },
          })
        ).data.map(row => row.id),
      ).toEqual(['archived'])
    } finally {
      sqlite.close()
    }
  })
})
