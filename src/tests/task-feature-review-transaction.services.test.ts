// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { commitTaskFeatureReview } from '$lib/db/services/task'
import type { Database, TaskFeatureReviewCommit } from '$lib/types'

const stores: DatabaseSync[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

/** Executes actual review SQL with the same ordered transaction contract as D1. */
function setup(type: TaskFeatureReviewCommit['task']['type'] = 'newFeature') {
  const sqlite = new DatabaseSync(':memory:')
  stores.push(sqlite)
  sqlite.exec(`CREATE TABLE task (id TEXT PRIMARY KEY, featureId TEXT, projectId TEXT,
    organisationId TEXT, type TEXT, modifiedAt TEXT, isReviewed INTEGER, isDraft INTEGER,
    reviewerId TEXT, reviewReason TEXT, reviewOutcome TEXT, reviewAction TEXT);
    CREATE TABLE feature (id TEXT PRIMARY KEY, projectId TEXT, modifiedAt TEXT,
      isPendingReview INTEGER, isArchived INTEGER, isIntangible INTEGER, isPublished INTEGER, isVisitable INTEGER);
    CREATE TABLE project (id TEXT PRIMARY KEY, organisationId TEXT);
    CREATE TABLE organisation (id TEXT PRIMARY KEY, hubId TEXT);
    INSERT INTO project VALUES ('project', 'org');
    INSERT INTO organisation VALUES ('org', 'hub');`)
  sqlite
    .prepare('INSERT INTO task VALUES (?, ?, ?, ?, ?, ?, 0, 0, null, null, null, null)')
    .run('task', 'feature', 'project', 'org', type, 'task-v1')
  sqlite
    .prepare('INSERT INTO feature VALUES (?, ?, ?, ?, 0, 0, ?, 1)')
    .run(
      'feature',
      'project',
      'feature-v1',
      type === 'newFeature' ? 1 : 0,
      type === 'newFeature' ? 0 : 1,
    )
  const db = drizzle({} as never) as Database
  vi.spyOn(db, 'batch').mockImplementation(async statements => {
    sqlite.exec('BEGIN')
    try {
      const results = statements.map(statement => {
        if (!('toSQL' in statement) || typeof statement.toSQL !== 'function')
          throw new Error('Expected SQL builder')
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
  const input: TaskFeatureReviewCommit = {
    task: {
      id: 'task',
      featureId: 'feature',
      projectId: 'project',
      organisationId: 'org',
      type,
      modifiedAt: 'task-v1',
    },
    feature: { id: 'feature', modifiedAt: 'feature-v1' },
    resourceHubId: 'hub',
    reviewerId: 'reviewer',
    reason: ' reviewed ',
    action: 'accept',
  }
  const snapshot = () => ({
    tasks: sqlite.prepare('SELECT * FROM task ORDER BY id').all(),
    features: sqlite.prepare('SELECT * FROM feature ORDER BY id').all(),
  })
  return { sqlite, db, input, snapshot }
}

describe('atomic feature-changing task reviews', () => {
  it.each([
    {
      type: 'newFeature',
      action: 'accept',
      patch: { isPendingReview: 0, isArchived: 0 },
    },
    {
      type: 'newFeature',
      action: 'reject',
      patch: { isPendingReview: 0, isArchived: 1 },
    },
    { type: 'reportedMissing', action: 'setIntangible', patch: { isIntangible: 1 } },
    {
      type: 'reportedMissing',
      action: 'setUnpublished',
      patch: { isPublished: 0, isVisitable: 0 },
    },
    {
      type: 'reportedMissing',
      action: 'setArchived',
      patch: { isArchived: 1, isPublished: 0, isVisitable: 0 },
    },
  ] as const)(
    'commits $type/$action with task completion',
    async ({ type, action, patch }) => {
      const { db, sqlite, input } = setup(type)
      expect(await commitTaskFeatureReview(db, { ...input, action })).toBe(true)
      expect(sqlite.prepare('SELECT * FROM feature').get()).toMatchObject(patch)
      expect(
        sqlite
          .prepare(
            'SELECT isReviewed, reviewerId, reviewReason, reviewOutcome FROM task',
          )
          .get(),
      ).toEqual({
        isReviewed: 1,
        reviewerId: 'reviewer',
        reviewReason: 'reviewed',
        reviewOutcome: action === 'reject' ? 'rejected' : 'accepted',
      })
      expect(db.batch).toHaveBeenCalledOnce()
    },
  )

  it.each(['task', 'feature'])(
    'rolls back both rows if the %s write fails',
    async table => {
      const { db, sqlite, input, snapshot } = setup()
      sqlite.exec(`CREATE TRIGGER fail_review BEFORE UPDATE ON ${table}
      BEGIN SELECT RAISE(ABORT, 'review failed'); END;`)
      const before = snapshot()
      await expect(commitTaskFeatureReview(db, input)).rejects.toThrow('review failed')
      expect(snapshot()).toEqual(before)
    },
  )

  it.each([
    'task-version',
    'feature-version',
    'reviewed',
    'draft',
    'scope',
    'hub',
    'missing-feature',
    'missing-task',
  ])('makes no changes for stale state: %s', async state => {
    const { db, sqlite, input, snapshot } = setup()
    if (state === 'task-version') sqlite.exec("UPDATE task SET modifiedAt = 'task-v2'")
    if (state === 'feature-version')
      sqlite.exec("UPDATE feature SET modifiedAt = 'feature-v2'")
    if (state === 'reviewed') sqlite.exec('UPDATE task SET isReviewed = 1')
    if (state === 'draft') sqlite.exec('UPDATE task SET isDraft = 1')
    if (state === 'scope') sqlite.exec("UPDATE task SET projectId = 'other'")
    if (state === 'hub') sqlite.exec("UPDATE organisation SET hubId = 'other'")
    if (state === 'missing-feature') sqlite.exec('DELETE FROM feature')
    if (state === 'missing-task') sqlite.exec('DELETE FROM task')
    // A prior connection change must not satisfy the next batch's task-write guard.
    sqlite.exec('UPDATE feature SET isArchived = isArchived')
    const before = snapshot()
    expect(await commitTaskFeatureReview(db, input)).toBe(false)
    expect(snapshot()).toEqual(before)
  })

  it.each(['accept', 'reject'] as const)(
    'keeps the winning %s review unchanged',
    async action => {
      const { db, sqlite, input } = setup()
      const results = await Promise.all([
        commitTaskFeatureReview(db, { ...input, action }),
        commitTaskFeatureReview(db, {
          ...input,
          action: action === 'accept' ? 'reject' : 'accept',
          reviewerId: 'loser',
        }),
      ])
      expect(results).toEqual([true, false])
      expect(sqlite.prepare('SELECT isArchived FROM feature').get()).toEqual({
        isArchived: action === 'reject' ? 1 : 0,
      })
      expect(sqlite.prepare('SELECT reviewerId FROM task').get()).toEqual({
        reviewerId: 'reviewer',
      })
    },
  )

  it('leaves another task pending when its shared feature snapshot is stale', async () => {
    const { db, sqlite, input } = setup()
    sqlite.exec(
      "INSERT INTO task SELECT 'other-task', featureId, projectId, organisationId, type, modifiedAt, isReviewed, isDraft, reviewerId, reviewReason, reviewOutcome, reviewAction FROM task",
    )
    expect(await commitTaskFeatureReview(db, input)).toBe(true)
    expect(
      await commitTaskFeatureReview(db, {
        ...input,
        task: { ...input.task, id: 'other-task' },
        action: 'reject',
      }),
    ).toBe(false)
    expect(
      sqlite.prepare("SELECT isReviewed FROM task WHERE id = 'other-task'").get(),
    ).toEqual({ isReviewed: 0 })
    expect(sqlite.prepare('SELECT isArchived FROM feature').get()).toEqual({
      isArchived: 0,
    })
  })
})
