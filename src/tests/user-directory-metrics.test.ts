// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
// The existing profile scope owns hub/layer publication policy; verify aggregation consumes it.
vi.mock('#lib/api/services/user', () => ({
  toUserContributionFeatureScope: () =>
    sql`(select id from feature where isPublished=1 and isDraft=0)`,
}))
import { readUserDirectoryMetrics } from '#lib/api/services/userDirectoryMetrics.js'
import type { Database, SessionUser } from '#lib/types.js'

describe('visible directory metrics', () => {
  it('aggregates public contributions without join multiplication or private payloads', async () => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      sqlite.exec(`
        CREATE TABLE user(id TEXT, isArchived INTEGER);
        CREATE TABLE feature(id TEXT, contributorId TEXT, isPublished INTEGER, isDraft INTEGER);
        CREATE TABLE image(id TEXT, contributorId TEXT, isArchived INTEGER);
        CREATE TABLE featureImage(imageId TEXT,featureId TEXT,isPublished INTEGER);
        CREATE TABLE task(id TEXT, contributorId TEXT,featureId TEXT,type TEXT);
        INSERT INTO user VALUES('a',0),('b',0);
        INSERT INTO feature VALUES('f1','a',1,0),('f2','a',1,0),('hidden','a',0,0),('draft','a',1,1);
        INSERT INTO image VALUES('p1','a',0),('p2','a',1),('p3','a',0),('p4','a',0);
        INSERT INTO featureImage VALUES('p1','f1',1),('p1','f2',1),('p2','f1',1),('p3','hidden',1),('p4','f1',0);
        INSERT INTO task VALUES('t1','a','f1','reportedMissing'),('t2','a','hidden','reportedMissing'),('t3','a','f1','newPhoto');
      `)
      const db = drizzle(async (query, params) => {
        const statement = sqlite.prepare(query)
        statement.setReturnArrays(true)
        return { rows: statement.all(...params) as unknown as unknown[][] }
      }) as unknown as Database
      const params = {
        userIds: ['a', 'b', 'missing'],
        actor: { id: 'staff', superAdmin: true, isAnonymous: false } as SessionUser,
        userRoles: [],
      }
      expect(await readUserDirectoryMetrics(db, params)).toEqual([
        {
          userId: 'a',
          publishedFeatures: 2,
          publishedPhotos: 1,
          missingPlaceReports: 1,
        },
        {
          userId: 'b',
          publishedFeatures: 0,
          publishedPhotos: 0,
          missingPlaceReports: 0,
        },
      ])
      await expect(
        readUserDirectoryMetrics(db, {
          ...params,
          actor: { ...params.actor, isAnonymous: true },
        }),
      ).rejects.toMatchObject({ status: 403 })
      await expect(
        readUserDirectoryMetrics(db, { ...params, userIds: Array(26).fill('a') }),
      ).rejects.toMatchObject({ status: 400 })
    } finally {
      sqlite.close()
    }
  })
})
