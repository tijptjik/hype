// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { publicationSqlite } from './fixtures/publicationSqlite'
// SERVICES
import { readFeatureBaselineActor } from '#lib/db/services/featureBaselineAttribution.js'
// TYPES
import type { Database } from '#lib/types.js'

let fixture: ReturnType<typeof publicationSqlite>
const migration = readFileSync(
  'migrations/0194_feature_baseline_attribution.sql',
  'utf8',
)
beforeEach(() => {
  fixture = publicationSqlite({})
  fixture.sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE feature(id TEXT PRIMARY KEY,contributorId TEXT);
    CREATE TABLE featureRevisionHead(featureId TEXT PRIMARY KEY);
    CREATE TABLE featureRevisionPublication(id TEXT PRIMARY KEY,featureId TEXT,generation INTEGER,changeSetId TEXT);
    CREATE TABLE revisionChangeSet(id TEXT PRIMARY KEY,origin TEXT);
    CREATE TABLE task(id TEXT PRIMARY KEY,featureId TEXT,type TEXT,contributorId TEXT,reviewerId TEXT,isReviewed INTEGER,reviewOutcome TEXT,reviewAction TEXT);
    CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,username TEXT,displayUsername TEXT);
    INSERT INTO user VALUES('author','Author','author','Author'),('reviewer','Reviewer','reviewer','Reviewer');
    INSERT INTO feature VALUES('f','author');
    INSERT INTO featureRevisionHead VALUES('f');
    INSERT INTO revisionChangeSet VALUES('migration','migration'),('user','user');`)
})
afterEach(() => fixture.sqlite.close())

/** Inserts a synthetic creation/review task with optional overrides.
 * @param values Fixture task overrides. @returns Nothing.
 */
function task(
  values: Partial<{
    id: string
    type: string
    reviewer: string | null
    reviewed: number
    outcome: string | null
    action: string | null
  }> = {},
): void {
  const v = {
    id: 'task',
    type: 'newFeature',
    reviewer: 'reviewer',
    reviewed: 1,
    outcome: 'accepted',
    action: 'added-feature',
    ...values,
  }
  fixture.sqlite
    .prepare('INSERT INTO task VALUES(?,?,?,?,?,?,?,?)')
    .run(v.id, 'f', v.type, 'author', v.reviewer, v.reviewed, v.outcome, v.action)
}
/** Inserts an initial publication receipt, including private baselines.
 * @param origin Operation origin. @returns Nothing.
 */
function baseline(origin = 'migration'): void {
  fixture.sqlite
    .prepare('INSERT INTO featureRevisionPublication VALUES(?,?,0,?)')
    .run('baseline', 'f', origin)
}
/** Reads the captured primary actor. @returns Frozen identity with current display information. */
function actor(): ReturnType<typeof readFeatureBaselineActor> {
  return readFeatureBaselineActor(fixture.db as unknown as Database, 'baseline')
}

describe('legacy Feature attribution', () => {
  it('backfills the accepted creation reviewer and retains the contributor without rewriting the migration', async () => {
    task()
    baseline()
    fixture.sqlite.exec(migration)
    expect(await actor()).toMatchObject({
      actorId: 'reviewer',
      actorUsername: 'reviewer',
      role: 'reviewer',
    })
    expect(
      fixture.sqlite
        .prepare(
          'SELECT contributorId,reviewerId,taskId,basis FROM featureBaselineAttribution',
        )
        .get(),
    ).toEqual({
      contributorId: 'author',
      reviewerId: 'reviewer',
      taskId: 'task',
      basis: 'reviewed-task',
    })
    expect(
      fixture.sqlite
        .prepare("SELECT origin FROM revisionChangeSet WHERE id='migration'")
        .get(),
    ).toEqual({ origin: 'migration' })
    expect(fixture.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('captures future enrollment atomically and ignores unrelated task reviewers', async () => {
    task({ type: 'newPhoto', action: 'added-all-photos' })
    fixture.sqlite.exec(migration)
    fixture.sqlite.exec('BEGIN')
    baseline()
    expect(await actor()).toMatchObject({ actorId: 'author', role: 'contributor' })
    fixture.sqlite.exec('ROLLBACK')
    expect(await actor()).toBeNull()
    baseline()
    expect(await actor()).toMatchObject({ actorId: 'author', role: 'contributor' })
  })

  it.each([
    { reviewer: null, reviewed: 0, outcome: null, action: null },
    { reviewer: 'reviewer', reviewed: 1, outcome: 'rejected', action: 'ignored' },
    { reviewer: null, reviewed: 1, outcome: 'accepted', action: 'added-feature' },
  ])('never credits a pending, rejected or absent reviewer: %j', async values => {
    task(values)
    fixture.sqlite.exec(migration)
    baseline()
    expect(await actor()).toMatchObject({ actorId: 'author', role: 'contributor' })
  })

  it('leaves ambiguous creation tasks unresolved', async () => {
    task()
    task({ id: 'second' })
    fixture.sqlite.exec(migration)
    baseline()
    expect(await actor()).toBeNull()
  })

  it('does not invent an identity when contribution evidence is missing', async () => {
    fixture.sqlite.exec('UPDATE feature SET contributorId=NULL')
    fixture.sqlite.exec(migration)
    baseline()
    expect(await actor()).toBeNull()
  })

  it('does not replace attribution of newly authored user revisions', async () => {
    fixture.sqlite.exec(migration)
    baseline('user')
    expect(await actor()).toBeNull()
  })

  it('retains historical identifiers across live task/profile changes and refuses mutation', async () => {
    task()
    baseline()
    fixture.sqlite.exec(migration)
    fixture.sqlite.exec(
      "DELETE FROM task; DELETE FROM user WHERE id='reviewer'; UPDATE feature SET contributorId='changed'",
    )
    expect(await actor()).toMatchObject({
      actorId: 'reviewer',
      actorUsername: null,
      role: 'reviewer',
    })
    expect(() =>
      fixture.sqlite.exec("UPDATE featureBaselineAttribution SET reviewerId='changed'"),
    ).toThrow('immutable')
    expect(() => fixture.sqlite.exec('DELETE FROM featureBaselineAttribution')).toThrow(
      'immutable',
    )
  })

  it('supports deployments where the new migration is not yet installed', async () => {
    expect(await actor()).toBeNull()
  })
})
