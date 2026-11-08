// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { and } from 'drizzle-orm'
import { feature } from '#lib/db/schema/index.js'
import { toQueryConditions } from '#lib/api/services/feature.js'
import { publicationSqlite } from './fixtures/publicationSqlite'
import type { SessionUser, UserRoleDisco } from '#lib/types.js'

const actor = { id: 'member', isAnonymous: false, superAdmin: false } as SessionUser

describe('public features in admin lists', () => {
  it('includes public rows without granting private, archived or draft access', async () => {
    const { sqlite, db } = publicationSqlite({})
    sqlite.exec(`
      CREATE TABLE feature (id TEXT, organisationId TEXT, projectId TEXT,
        isPublished INTEGER, isArchived INTEGER, isDraft INTEGER);
      INSERT INTO feature VALUES
        ('public', 'org', 'project', 1, 0, 0),
        ('other-public', 'other-org', 'other', 1, 0, 0),
        ('private', 'org', 'project', 0, 0, 0),
        ('other-private', 'other-org', 'other', 0, 0, 0),
        ('archived', 'org', 'project', 1, 1, 0),
        ('draft', 'org', 'project', 1, 0, 1);
    `)
    const read = async (roles: UserRoleDisco[], params = {}) => {
      const { conditions } = toQueryConditions(db, actor, true, params, roles)
      const rows = await db
        .select({ id: feature.id })
        .from(feature)
        .where(and(...conditions))
      return rows.map(row => row.id).sort()
    }
    try {
      const member = [
        { type: 'organisation', role: 'member', organisationId: 'org' },
      ] as UserRoleDisco[]
      expect(await read(member)).toEqual(['other-public', 'public'])
      expect(await read(member, { projectId: 'project' })).toEqual(['public'])
      expect(await read(member, { isPublished: false })).toEqual([])
      expect(await read(member, { isArchived: true })).toEqual([])
      expect(await read(member, { isDraft: true })).toEqual([])
      const maintainer = [
        { type: 'project', role: 'maintainer', projectId: 'project' },
      ] as UserRoleDisco[]
      expect(await read(maintainer)).toEqual(['other-public', 'private', 'public'])
      expect(await read(maintainer, { isArchived: true })).toEqual([])
      const owner = [
        { type: 'organisation', role: 'owner', organisationId: 'org' },
      ] as UserRoleDisco[]
      expect(await read(owner)).toEqual([
        'archived',
        'other-public',
        'private',
        'public',
      ])
    } finally {
      sqlite.close()
    }
  })
})
