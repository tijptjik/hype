// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { commitTaskImageReview } from '$lib/db/services/task'
import type { Database } from '$lib/types'

const stores: DatabaseSync[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

/** Uses actual generated SQL and SQLite transactions for the D1 batch contract. */
function setup() {
  const sqlite = new DatabaseSync(':memory:')
  stores.push(sqlite)
  sqlite.exec(`CREATE TABLE task (id TEXT PRIMARY KEY, featureId TEXT, projectId TEXT,
    organisationId TEXT, type TEXT, modifiedAt TEXT, isReviewed INTEGER, isDraft INTEGER,
    reviewerId TEXT, reviewReason TEXT, reviewOutcome TEXT, reviewAction TEXT);
    CREATE TABLE image (id TEXT PRIMARY KEY, isArchived INTEGER, modifiedAt TEXT);
    CREATE TABLE featureImage (featureId TEXT, imageId TEXT, intent TEXT,
      isPublished INTEGER, localIsPublished INTEGER, publishedAt TEXT, publisherId TEXT,
      PRIMARY KEY (featureId, imageId));
    CREATE TABLE taskImage (taskId TEXT, imageId TEXT);
    CREATE TABLE feature (id TEXT, projectId TEXT);
    CREATE TABLE project (id TEXT, organisationId TEXT, imageId TEXT);
    CREATE TABLE organisation (id TEXT, imageId TEXT, hubId TEXT);
    CREATE TABLE hub (id TEXT, imageId TEXT);
    INSERT INTO task VALUES ('task', 'feature', 'project', 'org', 'newPhoto', 'version-1', 0, 0, null, null, null, null);
    INSERT INTO feature VALUES ('feature', 'project');
    INSERT INTO project VALUES ('project', 'org', null), ('foreign-project', 'org', null);
    INSERT INTO organisation VALUES ('org', null, null);
    INSERT INTO image VALUES ('selected', 0, 'initial'), ('unclassified', 0, 'initial');
    INSERT INTO taskImage VALUES ('task', 'selected'), ('task', 'unclassified');
    INSERT INTO featureImage VALUES ('feature', 'selected', 'general', 0, null, null, null),
      ('feature', 'unclassified', 'undefined', 0, null, null, null);`)
  const prepare = vi.fn((sql: string) => ({
    bind: (...params: unknown[]) => ({
      raw: async () => {
        const statement = sqlite.prepare(sql)
        statement.setReturnArrays(true)
        return statement.all(...(params as never[]))
      },
    }),
  }))
  const db = drizzle({ prepare } as never) as Database
  vi.spyOn(db, 'batch').mockImplementation(async statements => {
    sqlite.exec('BEGIN')
    try {
      const results = statements.map(statement => {
        if (!('toSQL' in statement) || typeof statement.toSQL !== 'function') {
          throw new Error('Expected a SQL query builder')
        }
        const query = statement.toSQL()
        return sqlite.prepare(query.sql).all(...query.params)
      })
      sqlite.exec('COMMIT')
      return results as never
    } catch (error) {
      sqlite.exec('ROLLBACK')
      throw error
    }
  })
  const expected = {
    id: 'task',
    featureId: 'feature',
    projectId: 'project',
    organisationId: 'org',
    type: 'newPhoto' as const,
    modifiedAt: 'version-1',
  }
  const snapshot = () => ({
    tasks: sqlite.prepare('SELECT * FROM task').all(),
    images: sqlite.prepare('SELECT * FROM image ORDER BY id').all(),
    assignments: sqlite.prepare('SELECT * FROM featureImage ORDER BY imageId').all(),
  })
  return { db, sqlite, expected, snapshot, prepare }
}

describe('atomic task image review', () => {
  it('recreates a missing assignment when accepting all task images', async () => {
    const { db, sqlite, expected } = setup()
    sqlite.exec("DELETE FROM featureImage WHERE imageId = 'selected'")
    expect(
      await commitTaskImageReview(db, {
        task: expected,
        resourceHubId: null,
        action: 'acceptAll',
        reviewerId: 'reviewer',
      }),
    ).toBe(true)
    expect(
      sqlite
        .prepare(
          "SELECT intent, isPublished FROM featureImage WHERE imageId = 'selected'",
        )
        .get(),
    ).toEqual({ intent: 'undefined', isPublished: 1 })
  })

  it('completes a missing-report rejection even when no images remain', async () => {
    const { db, sqlite, expected } = setup()
    sqlite.exec("UPDATE task SET type = 'reportedMissing'; DELETE FROM taskImage;")
    expect(
      await commitTaskImageReview(db, {
        task: { ...expected, type: 'reportedMissing' },
        resourceHubId: null,
        action: 'reject',
        reviewerId: 'reviewer',
      }),
    ).toBe(true)
    expect(sqlite.prepare('SELECT reviewOutcome, isReviewed FROM task').get()).toEqual({
      reviewOutcome: 'rejected',
      isReviewed: 1,
    })
    expect(db.batch).toHaveBeenCalledOnce()
  })

  it.each(['none', 'archive', 'completion'])(
    'commits classified acceptance and completion together (failure: %s)',
    async failure => {
      const { db, sqlite, expected, snapshot, prepare } = setup()
      if (failure === 'archive')
        sqlite.exec(`CREATE TRIGGER fail_archive BEFORE UPDATE ON image
        BEGIN SELECT RAISE(ABORT, 'archive failed'); END;`)
      if (failure === 'completion')
        sqlite.exec(`CREATE TRIGGER fail_completion BEFORE UPDATE ON task
        BEGIN SELECT RAISE(ABORT, 'completion failed'); END;`)
      const before = snapshot()
      const result = commitTaskImageReview(db, {
        task: expected,
        resourceHubId: null,
        action: 'acceptClassified',
        reviewerId: 'reviewer',
        reason: ' accepted ',
      })
      if (failure !== 'none') {
        await expect(result).rejects.toThrow(`${failure} failed`)
        expect(snapshot()).toEqual(before)
      } else {
        await expect(result).resolves.toBe(true)
        expect(
          sqlite
            .prepare(
              'SELECT isReviewed, reviewerId, reviewReason, reviewAction FROM task',
            )
            .get(),
        ).toEqual({
          isReviewed: 1,
          reviewerId: 'reviewer',
          reviewReason: 'accepted',
          reviewAction: 'added-all-photos-with-intent',
        })
        expect(
          sqlite.prepare('SELECT imageId, isPublished FROM featureImage').all(),
        ).toEqual([{ imageId: 'selected', isPublished: 1 }])
        expect(
          sqlite.prepare('SELECT id, isArchived FROM image ORDER BY id').all(),
        ).toEqual([
          { id: 'selected', isArchived: 0 },
          { id: 'unclassified', isArchived: 1 },
        ])
      }
      expect(db.batch).toHaveBeenCalledOnce()
      expect(prepare).toHaveBeenCalledOnce()
    },
  )

  it.each([
    'reviewed',
    'draft',
    'version',
    'scope',
    'feature-moved',
    'hub-moved',
    'missing',
  ])('makes no writes for a stale task (%s)', async state => {
    const { db, sqlite, expected, snapshot } = setup()
    if (state === 'reviewed') sqlite.exec('UPDATE task SET isReviewed = 1')
    if (state === 'draft') sqlite.exec('UPDATE task SET isDraft = 1')
    if (state === 'version') sqlite.exec("UPDATE task SET modifiedAt = 'version-2'")
    if (state === 'scope') sqlite.exec("UPDATE task SET projectId = 'foreign-project'")
    if (state === 'feature-moved')
      sqlite.exec("UPDATE feature SET projectId = 'foreign-project'")
    if (state === 'missing') sqlite.exec('DELETE FROM task')
    if (state === 'hub-moved')
      sqlite.exec("UPDATE organisation SET hubId = 'foreign-hub'")
    const before = snapshot()
    expect(
      await commitTaskImageReview(db, {
        task: expected,
        resourceHubId: null,
        action: 'acceptClassified',
        reviewerId: 'reviewer',
      }),
    ).toBe(false)
    expect(snapshot()).toEqual(before)
  })

  it('allows only one reviewer to apply a decision from the same snapshot', async () => {
    const { db, sqlite, expected } = setup()
    const results = await Promise.all([
      commitTaskImageReview(db, {
        task: expected,
        resourceHubId: null,
        action: 'acceptAll',
        reviewerId: 'first',
      }),
      commitTaskImageReview(db, {
        task: expected,
        resourceHubId: null,
        action: 'reject',
        reviewerId: 'second',
      }),
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
    const accepted = results[0]
    expect(sqlite.prepare('SELECT reviewerId, reviewOutcome FROM task').get()).toEqual({
      reviewerId: accepted ? 'first' : 'second',
      reviewOutcome: accepted ? 'accepted' : 'rejected',
    })
    expect(
      sqlite
        .prepare('SELECT count(*) AS count FROM featureImage WHERE isPublished = 1')
        .get(),
    ).toEqual({ count: accepted ? 2 : 0 })
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM image WHERE isArchived = 1').get(),
    ).toEqual({ count: accepted ? 0 : 2 })
  })
})
