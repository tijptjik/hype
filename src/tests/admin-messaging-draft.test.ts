// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import { prepareAdminMessagingWrites } from '#lib/api/services/adminUserMessaging.js'
import { user } from '#lib/db/schema/user.js'
import {
  createAdminMessagingDraft,
  applyAdminProfileSave,
} from '#lib/users/adminMessagingDraft.js'
import type { Database } from '#lib/types.js'

function fixture() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`CREATE TABLE user(id TEXT PRIMARY KEY, name TEXT CHECK(name != 'reject'), updatedAt INTEGER, preferredMessagingPlatform TEXT);
    INSERT INTO user VALUES ('target','Original',1000,NULL);
    CREATE TABLE userMessagingIdentity(userId TEXT, platform TEXT, phoneNumber TEXT, username TEXT, nativeId TEXT, sourceTelephone TEXT, validation TEXT, verifiedAt INTEGER, verifiedBy TEXT, updatedAt INTEGER, PRIMARY KEY(userId,platform));
    INSERT INTO userMessagingIdentity VALUES ('target','telegram',NULL,'original','42',NULL,NULL,1000,'actor',1000);`)
  function prepare(query: string, params: unknown[] = []) {
    return {
      bind: (...values: unknown[]) => prepare(query, values),
      async raw() {
        const statement = sqlite.prepare(query)
        statement.setReturnArrays(true)
        return statement.all(...(params as never[]))
      },
      async all() {
        return {
          results: sqlite.prepare(query).all(...(params as never[])),
          success: true,
          meta: {},
        }
      },
      async run() {
        return {
          meta: sqlite.prepare(query).run(...(params as never[])),
          success: true,
        }
      },
    }
  }
  const client = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sqlite.exec('BEGIN')
      try {
        const result = []
        for (const statement of statements) result.push(await statement.all())
        sqlite.exec('COMMIT')
        return result
      } catch (cause) {
        sqlite.exec('ROLLBACK')
        throw cause
      }
    },
  }
  const db = drizzle(client as never) as Database
  return { sqlite, db }
}

describe('profile messaging transaction', () => {
  it.each([false, true])('commits together, with rollback=%s', async rollback => {
    const { sqlite, db } = fixture()
    try {
      const guard = and(eq(user.id, 'target'), eq(user.updatedAt, new Date(1000)))!
      const { writes } = await prepareAdminMessagingWrites(
        db,
        'target',
        { whatsapp: '91234567', telegram: '@changed', preferredPlatform: 'telegram' },
        guard,
      )
      const profile = db
        .update(user)
        .set({
          name: rollback ? 'reject' : 'Changed',
          preferredMessagingPlatform: 'telegram',
          updatedAt: new Date(2000),
        })
        .where(guard)
        .returning({ id: user.id })
      const save = db.batch([writes[0]!, ...writes.slice(1), profile])
      if (rollback) await expect(save).rejects.toThrow()
      else await save
      expect(
        sqlite.prepare('SELECT name,preferredMessagingPlatform FROM user').get(),
      ).toEqual({
        name: rollback ? 'Original' : 'Changed',
        preferredMessagingPlatform: rollback ? null : 'telegram',
      })
      expect(
        sqlite
          .prepare(
            "SELECT username,verifiedAt FROM userMessagingIdentity WHERE platform='telegram'",
          )
          .get(),
      ).toEqual({
        username: rollback ? 'original' : 'changed',
        verifiedAt: rollback ? 1000 : null,
      })
      expect(
        sqlite
          .prepare(
            "SELECT phoneNumber FROM userMessagingIdentity WHERE platform='whatsapp'",
          )
          .get(),
      ).toEqual(rollback ? undefined : { phoneNumber: '+85291234567' })
    } finally {
      sqlite.close()
    }
  })
  it('does not write any messaging fields when the profile revision is stale', async () => {
    const { sqlite, db } = fixture()
    try {
      const guard = and(eq(user.id, 'target'), eq(user.updatedAt, new Date(999)))!
      const { writes } = await prepareAdminMessagingWrites(
        db,
        'target',
        { whatsapp: '91234567', telegram: '', preferredPlatform: null },
        guard,
      )
      const profile = db
        .update(user)
        .set({ name: 'Changed' })
        .where(guard)
        .returning({ id: user.id })
      const results = await db.batch([writes[0]!, ...writes.slice(1), profile])
      expect(results.at(-1)).toEqual([])
      expect(
        sqlite.prepare('SELECT username FROM userMessagingIdentity').all(),
      ).toEqual([{ username: 'original' }])
    } finally {
      sqlite.close()
    }
  })
  it('validates before saving and preserves unchanged ownership evidence', async () => {
    const { sqlite, db } = fixture()
    try {
      const guard = eq(user.id, 'target')
      expect(
        await prepareAdminMessagingWrites(
          db,
          'target',
          { whatsapp: '', telegram: '@original', preferredPlatform: null },
          guard,
        ),
      ).toMatchObject({ writes: [] })
      await expect(
        prepareAdminMessagingWrites(
          db,
          'target',
          { whatsapp: '123', telegram: '@original', preferredPlatform: null },
          guard,
        ),
      ).rejects.toMatchObject({ body: { field: 'whatsapp' } })
    } finally {
      sqlite.close()
    }
  })
})

it('reset creates fresh values from saved settings, without defaulting missing identities', () => {
  const saved = {
    platform: 'whatsapp' as const,
    preferredPlatform: null,
    identities: [],
  }
  const draft = createAdminMessagingDraft(saved)
  draft.telegram = '@changed'
  expect(createAdminMessagingDraft(saved)).toEqual({
    whatsapp: '',
    telegram: '',
    preferredPlatform: null,
  })
})

it('uses acknowledged service phones as the new display and reset baseline', () => {
  const before = {
    profile: { id: 'target', username: 'target', image: null },
    settings: { telephone: null },
    updatedAt: 'old',
    details: null,
    messagingSettings: {
      platform: 'whatsapp',
      preferredPlatform: null,
      identities: [],
    },
    contributionPreviews: { retained: true },
  } as unknown as Parameters<typeof applyAdminProfileSave>[0]
  const result = {
    username: 'target',
    displayUsername: 'Target',
    updatedAt: 'new',
    settings: { telephone: '+85291234567', image: null, attribution: null },
    messagingSettings: {
      platform: 'telegram',
      preferredPlatform: 'telegram',
      identities: [
        {
          platform: 'telegram',
          phoneNumber: '+85291234568',
          username: null,
          nativeId: null,
          verifiedAt: null,
          validation: null,
          updatedAt: 2,
        },
      ],
    },
  } as Parameters<typeof applyAdminProfileSave>[1]
  const after = applyAdminProfileSave(before, result)
  expect(after.settings?.telephone).toBe('+85291234567')
  expect(after.updatedAt).toBe('new')
  expect(after.contributionPreviews).toBe(before.contributionPreviews)
  const draft = createAdminMessagingDraft(after.messagingSettings)
  draft.telegram = 'unfinished edit'
  expect(createAdminMessagingDraft(after.messagingSettings).telegram).toBe(
    '+85291234568',
  )
  expect(before.settings?.telephone).toBeNull()
})
