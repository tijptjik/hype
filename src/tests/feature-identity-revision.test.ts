// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { afterEach, describe, expect, it } from 'vitest'
// DRIZZLE
import { sql } from 'drizzle-orm'
// SERVICES
import { initializeFeatureRevision } from '#lib/db/services/featureRevision.js'
import { readFeatureRevisionWorkspace } from '#lib/db/services/featureRevisionWorkspace.js'
import {
  createFeatureIdentityRevision,
  publishFeatureIdentityOperation,
} from '#lib/db/services/featureIdentityRevision.js'
// FIXTURES
import { publicationSqlite } from './fixtures/publicationSqlite'
import { featureRevisionContentFixture } from './fixtures/featureRevisionContent'
// TYPES
import type { Database } from '#lib/types.js'

const connections: ReturnType<typeof publicationSqlite>[] = []
afterEach(() => {
  for (const connection of connections.splice(0)) connection.sqlite.close()
})

async function fixture(fullContent = false) {
  const connection = publicationSqlite({})
  connections.push(connection)
  const { sqlite } = connection,
    db = connection.db as unknown as Database
  sqlite.exec('CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,username TEXT,displayUsername TEXT,attribution TEXT)')
  sqlite.exec(
    `PRAGMA foreign_keys=ON; CREATE TABLE feature(id TEXT PRIMARY KEY, isPublished INTEGER NOT NULL, localIsPublished INTEGER, isDraft INTEGER NOT NULL, modifiedAt TEXT,isPendingReview INTEGER NOT NULL DEFAULT 0,publisherId TEXT,publishedAt TEXT); INSERT INTO feature(id,isPublished,localIsPublished,isDraft,modifiedAt) VALUES ('a',1,NULL,0,'initial'),('b',1,NULL,0,'initial'),('c',0,NULL,1,'initial'),('d',0,NULL,1,'initial');`,
  )
  sqlite.exec(readFileSync('migrations/0171_feature_revisions.sql', 'utf8'))
  const common = {
    actorId: 'reviewer',
    guard: sql`1`,
    dispositions: {
      tasks: 'retain original identity',
      visits: 'retain original identity',
    },
    projection: { statements: [], verify: sql`1` },
  }
  const revisions: Record<string, string> = {}
  for (const featureId of ['a', 'b', 'c', 'd'])
    revisions[featureId] = (await initializeFeatureRevision(db, {
      ...common,
      featureId,
      content: fullContent ? featureRevisionContentFixture() : { name: featureId },
      published: featureId === 'a' || featureId === 'b',
    }))!
  const output = async (featureId: string) => {
    const result = await createFeatureIdentityRevision(db, {
      ...common,
      featureId,
      previousRevisionId: revisions[featureId],
      content: fullContent ? featureRevisionContentFixture() : { name: `${featureId} output` },
    })
    if (!result) throw new Error('Fixture output creation failed')
    return result
  }
  return { sqlite, db, common, revisions, output }
}

describe('atomic feature identity operations', () => {
  it('retains the absorbed Feature workspace and publication history under its own current scope', async () => {
    const f = await fixture(true)
    const output = await f.output('a')
    await publishFeatureIdentityOperation(f.db, { ...f.common, kind: 'merge',
      inputs: [{ featureId: 'a', revisionId: f.revisions.a }, { featureId: 'b', revisionId: f.revisions.b }],
      outputs: [output], expectedHeads: [
        { featureId: 'a', publishedRevisionId: f.revisions.a, generation: 0 },
        { featureId: 'b', publishedRevisionId: f.revisions.b, generation: 0 },
      ] })
    const request = { ...f.common, featureId: 'b', canPublish: true }
    const workspace = await readFeatureRevisionWorkspace(f.db, request)
    expect(workspace).toMatchObject({ enabled: true, state: 'merged', redirectFeatureId: 'a',
      publishedRevisionId: null, comparisonRevisionId: f.revisions.b })
    expect(workspace.history).toHaveLength(2)
    expect((await readFeatureRevisionWorkspace(f.db, { ...request, guard: sql`0` })).enabled).toBe(false)
  })
  it('keeps a merge survivor and redirects the absorbed identity with complete lineage', async () => {
    const f = await fixture(),
      output = await f.output('a')
    const id = await publishFeatureIdentityOperation(f.db, {
      ...f.common,
      kind: 'merge',
      inputs: [
        { featureId: 'a', revisionId: f.revisions.a },
        { featureId: 'b', revisionId: f.revisions.b },
      ],
      outputs: [output],
      expectedHeads: [
        { featureId: 'a', publishedRevisionId: f.revisions.a, generation: 0 },
        { featureId: 'b', publishedRevisionId: f.revisions.b, generation: 0 },
      ],
    })
    expect(id).not.toBeNull()
    expect(
      f.sqlite
        .prepare(
          "SELECT state,redirectFeatureId,publishedRevisionId FROM featureRevisionHead WHERE featureId='b'",
        )
        .get(),
    ).toEqual({ state: 'merged', redirectFeatureId: 'a', publishedRevisionId: null })
    expect(
      f.sqlite.prepare("SELECT isPublished FROM feature WHERE id='b'").get(),
    ).toEqual({ isPublished: 0 })
    expect(
      f.sqlite
        .prepare(
          'SELECT count(*) n FROM featureIdentityOperationMember WHERE operationId=?',
        )
        .get(id!),
    ).toEqual({ n: 3 })
    expect(() =>
      f.sqlite.exec("UPDATE feature SET isPublished=1 WHERE id='b'"),
    ).toThrow(/retired/)
    expect(() =>
      f.sqlite
        .prepare("INSERT INTO featureIdentityOperationMember VALUES (?,'output','c',?)")
        .run(id!, f.revisions.c),
    ).toThrow(/sealed/)
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
  it('splits into two new identities and unpublishes the source without an arbitrary redirect', async () => {
    const f = await fixture(),
      outputs = [await f.output('c'), await f.output('d')]
    expect(
      await publishFeatureIdentityOperation(f.db, {
        ...f.common,
        kind: 'split',
        inputs: [{ featureId: 'a', revisionId: f.revisions.a }],
        outputs,
        expectedHeads: [
          { featureId: 'a', publishedRevisionId: f.revisions.a, generation: 0 },
          { featureId: 'c', publishedRevisionId: null, generation: 0 },
          { featureId: 'd', publishedRevisionId: null, generation: 0 },
        ],
      }),
    ).not.toBeNull()
    expect(
      f.sqlite
        .prepare(
          "SELECT state,redirectFeatureId,publishedRevisionId FROM featureRevisionHead WHERE featureId='a'",
        )
        .get(),
    ).toEqual({ state: 'split', redirectFeatureId: null, publishedRevisionId: null })
    expect(
      f.sqlite
        .prepare(
          "SELECT id,isPublished,isDraft FROM feature WHERE id IN ('a','c','d') ORDER BY id",
        )
        .all(),
    ).toEqual([
      { id: 'a', isPublished: 0, isDraft: 0 },
      { id: 'c', isPublished: 1, isDraft: 0 },
      { id: 'd', isPublished: 1, isDraft: 0 },
    ])
  })
  it('allows a split to retain the source identity as one child', async () => {
    const f = await fixture(),
      outputs = [await f.output('a'), await f.output('c')]
    expect(
      await publishFeatureIdentityOperation(f.db, {
        ...f.common,
        kind: 'split',
        inputs: [{ featureId: 'a', revisionId: f.revisions.a }],
        outputs,
        expectedHeads: [
          { featureId: 'a', publishedRevisionId: f.revisions.a, generation: 0 },
          { featureId: 'c', publishedRevisionId: null, generation: 0 },
        ],
      }),
    ).not.toBeNull()
    expect(
      f.sqlite
        .prepare(
          "SELECT state,publishedRevisionId FROM featureRevisionHead WHERE featureId='a'",
        )
        .get(),
    ).toEqual({ state: 'active', publishedRevisionId: outputs[0].revisionId })
  })
  it('rolls back all outputs and source retirement when any source is stale', async () => {
    const f = await fixture(),
      outputs = [await f.output('a')]
    f.sqlite.exec("UPDATE featureRevisionHead SET generation=1 WHERE featureId='b'")
    expect(
      await publishFeatureIdentityOperation(f.db, {
        ...f.common,
        kind: 'merge',
        inputs: [
          { featureId: 'a', revisionId: f.revisions.a },
          { featureId: 'b', revisionId: f.revisions.b },
        ],
        outputs,
        expectedHeads: [
          { featureId: 'a', publishedRevisionId: f.revisions.a, generation: 0 },
          { featureId: 'b', publishedRevisionId: f.revisions.b, generation: 0 },
        ],
      }),
    ).toBeNull()
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureIdentityOperation').get(),
    ).toEqual({ n: 0 })
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM feature WHERE isPublished=1').get(),
    ).toEqual({ n: 2 })
    expect(
      f.sqlite
        .prepare(
          "SELECT publishedRevisionId FROM featureRevisionHead WHERE featureId='a'",
        )
        .get(),
    ).toEqual({ publishedRevisionId: f.revisions.a })
  })
  it('cannot absorb an existing published identity as a supposedly new split child', async () => {
    const f = await fixture()
    await expect(
      publishFeatureIdentityOperation(f.db, {
        ...f.common,
        kind: 'split',
        inputs: [{ featureId: 'a', revisionId: f.revisions.a }],
        outputs: [await f.output('a'), await f.output('b')],
        expectedHeads: [
          { featureId: 'a', publishedRevisionId: f.revisions.a, generation: 0 },
          { featureId: 'b', publishedRevisionId: f.revisions.b, generation: 0 },
        ],
      }),
    ).rejects.toThrow(/unpublished heads/)
  })
})

it('rolls back source retirement and child publication when final projection verification fails', async () => {
  const f = await fixture(),
    outputs = [await f.output('c'), await f.output('d')]
  expect(
    await publishFeatureIdentityOperation(f.db, {
      ...f.common,
      projection: { statements: [], verify: sql`0` },
      kind: 'split',
      inputs: [{ featureId: 'a', revisionId: f.revisions.a }],
      outputs,
      expectedHeads: [
        { featureId: 'a', publishedRevisionId: f.revisions.a, generation: 0 },
        { featureId: 'c', publishedRevisionId: null, generation: 0 },
        { featureId: 'd', publishedRevisionId: null, generation: 0 },
      ],
    }),
  ).toBeNull()
  expect(
    f.sqlite
      .prepare(
        "SELECT id,isPublished,isDraft FROM feature WHERE id IN ('a','c','d') ORDER BY id",
      )
      .all(),
  ).toEqual([
    { id: 'a', isPublished: 1, isDraft: 0 },
    { id: 'c', isPublished: 0, isDraft: 1 },
    { id: 'd', isPublished: 0, isDraft: 1 },
  ])
  expect(
    f.sqlite.prepare('SELECT count(*) n FROM featureIdentityOperation').get(),
  ).toEqual({ n: 0 })
})
