// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { describe, expect, it } from 'vitest'
// SERVICES
import { toUserSearchQueryPlan } from '#lib/api/services/user.js'
import { searchUsersByConditions } from '#lib/db/services/user.js'
import { UserSearchQueryParamsSchema } from '#lib/db/zod/schema/user.js'
import { organisationUsersCondition } from '#lib/db/services/organisationUsers.js'
// TYPES
import type { Database } from '#lib/types.js'

describe('contact-presence search', () => {
  it('combines contact presence, text, archived state and paging with accurate counts', async () => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      sqlite.exec(`CREATE TABLE user (
        id TEXT, name TEXT, username TEXT, displayUsername TEXT, email TEXT,
        telephone TEXT, image TEXT, attribution TEXT, locale TEXT, emailVerified INTEGER,
        isArchived INTEGER, isAnonymous INTEGER, createdAt INTEGER, updatedAt INTEGER
      );
      CREATE TABLE userMessagingIdentity (userId TEXT, platform TEXT);
      INSERT INTO userMessagingIdentity VALUES
        ('both','whatsapp'), ('both','telegram'), ('email','telegram');
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
      expect(both.data[0].hasMessagingIdentity).toBe(true)
      const identities = await search({})
      expect(identities.data.map(row => [row.id, row.hasMessagingIdentity])).toEqual([
        ['both', true],
        ['email', true],
        ['phone', false],
        ['blank', false],
        ['missing', false],
      ])
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
      // Profile, language and flags compose with existing contact/search constraints.
      sqlite.exec(`UPDATE user SET locale='en', createdAt=1735689600000;
        UPDATE user SET username='runner', image='photo.png', attribution='Volunteer',
          emailVerified=1, locale='zh-hant', createdAt=1735775999999 WHERE id='both';
        UPDATE user SET username=' ',image=' ',attribution=' ',isAnonymous=1,
          createdAt=1735776000000 WHERE id='blank';`)
      expect(
        (
          await search({
            conditions: {
              hasUsername: true,
              hasImage: true,
              hasAttribution: true,
              emailVerified: true,
              locale: 'zh-hant',
            },
          })
        ).data.map(row => row.id),
      ).toEqual(['both'])
      expect(
        (
          await search({
            conditions: { hasImage: false, hasAttribution: false, hasUsername: false },
          })
        ).totalCount,
      ).toBe(4)
      expect(
        (await search({ conditions: { emailVerified: false, isAnonymous: false } }))
          .totalCount,
      ).toBe(3)
      expect(
        (await search({ conditions: { isAnonymous: true } })).data.map(row => row.id),
      ).toEqual(['blank'])
      expect((await search({})).joinedRange).toEqual({
        from: 1735689600000,
        to: 1735776000000,
      })
      expect((await search({ q: 'does-not-exist' })).joinedRange).toBeNull()
      // Inclusive UTC days retain the final millisecond and exclude next-day midnight.
      expect(
        (
          await search({
            conditions: { joinedFrom: '2025-01-01', joinedTo: '2025-01-01' },
          })
        ).totalCount,
      ).toBe(4)
      expect(
        (await search({ conditions: { joinedFrom: '2025-01-02' } })).data.map(
          row => row.id,
        ),
      ).toEqual(['blank'])
      expect(
        UserSearchQueryParamsSchema.safeParse({
          conditions: { joinedFrom: '2025-02-30' },
        }).success,
      ).toBe(false)
      expect(
        UserSearchQueryParamsSchema.safeParse({
          conditions: { joinedFrom: '2025-02-02', joinedTo: '2025-02-01' },
        }).success,
      ).toBe(false)
      sqlite.exec(
        "CREATE TABLE organisationRole(organisationId TEXT,userId TEXT,role TEXT); INSERT INTO organisationRole VALUES('a','both','user'),('a','email','owner'),('b','phone','member')",
      )
      const scoped = await toUserSearchQueryPlan(
        db,
        UserSearchQueryParamsSchema.parse({ pagination: { limit: 1, offset: 1 } }),
      )
      scoped.conditions.push(organisationUsersCondition('a'))
      const page = await searchUsersByConditions(db, scoped)
      expect(page.data.map(row => row.id)).toEqual(['email'])
      expect(page.totalCount).toBe(2)
    } finally {
      sqlite.close()
    }
  })
})
