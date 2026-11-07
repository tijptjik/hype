// @vitest-environment node
// TESTS
import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { eq, sql } from 'drizzle-orm'
// DB
import * as schema from '#lib/db/schema/index.js'
import { taskEntityWithRelations } from '#lib/api/services/task.js'
import {
  listTaskQueue,
  probeLocationTask,
  taskQueueProjection,
} from '#lib/db/services/taskQueue.js'
// TYPES
import type { Database } from '#lib/types.js'
vi.mock('#lib/db/services/hub.js', () => ({ getTaskHubFilter: () => undefined }))
let sqlite: DatabaseSync
afterEach(() => sqlite?.close())

function setup() {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`CREATE TABLE task(id TEXT,organisationId TEXT,projectId TEXT,featureId TEXT,contributorId TEXT,reviewerId TEXT,isDraft INTEGER,type TEXT,message TEXT,isReviewed INTEGER,reviewOutcome TEXT,reviewAction TEXT,reviewReason TEXT,createdAt TEXT,modifiedAt TEXT);
 CREATE TABLE organisation(id TEXT,hubId TEXT); CREATE TABLE project(id TEXT,organisationId TEXT);
 CREATE TABLE feature(id TEXT,organisationId TEXT,projectId TEXT,isDraft INTEGER,createdAt TEXT,modifiedAt TEXT);
 CREATE TABLE featureI18n(featureId TEXT,locale TEXT,title TEXT);
 CREATE TABLE featureLocation(featureId TEXT,locationId TEXT,factsRevisionId TEXT,locationRevisionId TEXT,factsOrganisationRevision TEXT,locationOrganisationRevision TEXT);
 CREATE TABLE location(id TEXT,state TEXT,ownerOrganisationId TEXT,ssId TEXT,sourceAvailability TEXT,kind TEXT DEFAULT 'unknown');
 CREATE TABLE locationRevision(id TEXT,locationId TEXT,version INTEGER,facts TEXT);
 CREATE TABLE organisationLocation(organisationId TEXT,locationId TEXT,revision TEXT); CREATE VIEW organisationLocationHead AS SELECT * FROM organisationLocation;
 CREATE TABLE locationAdoptionProposal(id TEXT,featureId TEXT,projectId TEXT,locationId TEXT,candidateRevisionId TEXT,organisationRevision TEXT,evidence TEXT,factsDecision TEXT,locationDecision TEXT,createdAt TEXT,occupancyRevisionId TEXT,addressRevisionId TEXT);
 CREATE TABLE locationOccupancy(id TEXT,containerLocationId TEXT,relationshipId TEXT,scopeOrganisationId TEXT,assertionState TEXT); CREATE VIEW locationOccupancyHead AS SELECT * FROM locationOccupancy;
 CREATE TABLE locationMembership(id TEXT,childLocationId TEXT,parentLocationId TEXT);
 CREATE TABLE locationIdentityReview(id TEXT,locationId TEXT,ownerOrganisationId TEXT,baseline TEXT,projection TEXT,mergeReviews TEXT,rejection TEXT,createdAt TEXT);
 CREATE TABLE locationIdentityHistory(id TEXT,locationId TEXT,previousHistoryId TEXT,reviewId TEXT);
 INSERT INTO organisation VALUES('org','hub'),('other-org','other-hub'); INSERT INTO project VALUES('p','org'),('other','other-org');
 INSERT INTO feature VALUES('f','org','p',0,'2026-01-01','2026-01-01');
 INSERT INTO featureI18n VALUES('f','en','Bakery');
 INSERT INTO location(id,state,ownerOrganisationId,ssId,sourceAvailability) VALUES('l','unresolved','org',NULL,'current');
 INSERT INTO locationRevision VALUES('old','l',1,NULL),('new','l',2,NULL);
 INSERT INTO featureLocation VALUES('f','l','old','old',NULL,NULL);
 INSERT INTO task VALUES('native','org','p','f','actor',NULL,0,'newPhoto',NULL,0,NULL,NULL,NULL,'2026-01-01','2026-01-01');`)
  sqlite.exec(
    `ALTER TABLE locationRevision ADD COLUMN rawSource TEXT; ALTER TABLE feature ADD COLUMN addressMeta TEXT; ALTER TABLE feature ADD COLUMN isArchived INTEGER DEFAULT 0; ALTER TABLE featureLocation ADD COLUMN version TEXT;`,
  )
  sqlite.exec(`CREATE TABLE user(id TEXT,name TEXT);
    ALTER TABLE featureI18n ADD COLUMN description TEXT;
    ALTER TABLE featureI18n ADD COLUMN displayAddress TEXT;
    ALTER TABLE project ADD COLUMN code TEXT;
    ALTER TABLE organisation ADD COLUMN code TEXT;
    CREATE TABLE projectI18n(projectId TEXT,name TEXT,nameShort TEXT,description TEXT);
    CREATE TABLE organisationI18n(organisationId TEXT,name TEXT,nameShort TEXT,description TEXT);`)
  sqlite.exec(readFileSync('migrations/0157_location_rematching.sql', 'utf8'))
  const prepare = (text: string) => ({
    bind: (...args: unknown[]) => ({
      all: async () => ({ results: sqlite.prepare(text).all(...(args as never[])) }),
      raw: async () => {
        const stmt = sqlite.prepare(text)
        stmt.setReturnArrays(true)
        return stmt.all(...(args as never[]))
      },
    }),
  })
  const db = drizzle({ prepare } as never, { schema }) as Database
  // Relations are a hydration boundary; SQL below still performs the actual source, authorization and pagination work.
  db.query.task.findMany = vi.fn(
    async () => [sqlite.prepare("SELECT * FROM task WHERE id='native'").get()] as never,
  ) as unknown as typeof db.query.task.findMany
  db.query.feature.findMany = vi.fn(
    async () =>
      [
        {
          id: 'f',
          images: [{ imageId: 'photo', image: { id: 'photo' } }],
          project: { id: 'p', organisation: { id: 'org' } },
        },
      ] as never,
  ) as unknown as typeof db.query.feature.findMany
  const opts = {
    i18n: { en: {}, zhHans: {}, zhHant: {} },
    isSuperAdmin: true,
    isAdminRequest: true,
    isCore: true,
  }
  return { db, opts }
}
it('budgets relational hydration bindings for large native task queues', async () => {
  const { db, opts } = setup()
  for (let index = 0; index < 150; index++) sqlite.prepare(`INSERT INTO task
    SELECT ?,organisationId,projectId,featureId,contributorId,reviewerId,isDraft,type,message,isReviewed,reviewOutcome,reviewAction,reviewReason,createdAt,modifiedAt FROM task WHERE id='native'`).run(`native-${index}`)
  const compiler = drizzle({} as never, { schema })
  const counts: number[] = []
  vi.mocked(db.query.task.findMany).mockImplementation(config => {
    const query = compiler.query.task.findMany(config)
    counts.push(query.toSQL().params.length)
    vi.spyOn(query, 'execute').mockResolvedValue([])
    return query
  })
  await listTaskQueue(db, taskEntityWithRelations, [], opts)
  expect(counts).toHaveLength(2)
  expect(counts.every(count => count <= 100)).toBe(true)
})

function proposal(id = 'proposal') {
  sqlite
    .prepare(
      'INSERT INTO locationAdoptionProposal(id,featureId,projectId,locationId,candidateRevisionId,organisationRevision,evidence,factsDecision,locationDecision,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      id,
      'f',
      'p',
      'l',
      'new',
      '',
      JSON.stringify({ plan: { decision: { facts: 'review', location: 'review' } } }),
      null,
      null,
      '2026-01-02',
    )
}
function identity(id = 'identity', ssId = 'source') {
  const baseline = {
    expectedState: 'unresolved',
    expectedSsId: null,
    expectedSourceAvailability: 'current',
    expectedLatestRevisionId: 'new',
    expectedHistoryId: null,
  }
  sqlite
    .prepare('INSERT INTO locationIdentityReview VALUES(?,?,?,?,?,?,?,?)')
    .run(
      id,
      'l',
      'org',
      JSON.stringify(baseline),
      JSON.stringify({ ssId }),
      '[]',
      null,
      '2026-01-03',
    )
}

it('paginates and counts contribution and real Location tasks together, with ordinary type, scope and search filters', async () => {
  const { db, opts } = setup()
  proposal()
  identity()
  const first = await listTaskQueue(
    db,
    {},
    [eq(schema.task.isReviewed, false)],
    opts,
    { limit: 2 },
    { sortBy: 'createdAt', sortOrder: 'desc' },
  )
  expect(first.totalCount).toBe(4)
  expect(first.data).toHaveLength(2)
  expect(first.nextOffset).toBe(2)
  expect(first.data[0].type).toBe('locationIdentity')
  const second = await listTaskQueue(
    db,
    {},
    [],
    opts,
    { limit: 2, offset: 2 },
    { sortBy: 'createdAt', sortOrder: 'desc' },
  )
  expect(second.data.map(row => row.type)).toContain('newPhoto')
  expect(second.hasMore).toBe(false)
  const position = await listTaskQueue(
    db,
    {},
    [eq(schema.task.type, 'locationPosition')],
    opts,
  )
  expect(position.data.map(row => row.locationTask?.proposalId)).toEqual(['proposal'])
  expect(
    (await listTaskQueue(db, {}, [eq(schema.task.organisationId, 'other-org')], opts))
      .totalCount,
  ).toBe(0)
  expect(
    (await listTaskQueue(db, {}, [], opts, undefined, undefined, { q: 'Bakery' }))
      .totalCount,
  ).toBe(4)
  expect(
    (await listTaskQueue(db, {}, [], opts, undefined, undefined, { q: 'missing' }))
      .totalCount,
  ).toBe(0)
  expect(await probeLocationTask(db, 'locationFacts:f:new:')).toMatchObject({
    projectId: 'p',
    organisationId: 'org',
    isReviewed: false,
  })
})

it('uses source decisions and accepted revisions to remove tasks; reassessment cannot reopen a rejected group', async () => {
  const { db, opts } = setup()
  proposal()
  const before = await listTaskQueue(db, {}, [], opts)
  sqlite.exec(
    "UPDATE locationAdoptionProposal SET factsDecision='{}'; INSERT INTO locationAdoptionProposal(id,featureId,projectId,locationId,candidateRevisionId,organisationRevision,evidence,factsDecision,locationDecision,createdAt) SELECT 'reassessment',featureId,projectId,locationId,candidateRevisionId,organisationRevision,evidence,NULL,NULL,createdAt FROM locationAdoptionProposal WHERE id='proposal'",
  )
  const after = await listTaskQueue(db, {}, [], opts)
  expect(before.data.find(row => row.type === 'locationPosition')?.id).toBe(
    after.data.find(row => row.type === 'locationPosition')?.id,
  )
  expect(after.data.some(row => row.type === 'locationFacts')).toBe(false)
  sqlite.exec("UPDATE featureLocation SET locationRevisionId='new'")
  expect((await listTaskQueue(db, {}, [], opts)).data.map(row => row.id)).toEqual([
    'native',
  ])
  expect(sqlite.prepare('SELECT count(*) count FROM task').get()).toEqual({ count: 1 })
})

it('derives merge tasks from occupied identities, and excludes rejected, completed, stale and foreign-owner evidence', async () => {
  const { db, opts } = setup()
  identity()
  sqlite.exec(
    "INSERT INTO location(id,state,ownerOrganisationId,ssId,sourceAvailability) VALUES('occupied','linked',NULL,'source','current')",
  )
  expect(
    (await listTaskQueue(db, {}, [], opts)).data.some(
      row => row.type === 'locationMerge',
    ),
  ).toBe(true)
  sqlite.exec("UPDATE locationIdentityReview SET rejection='{}'")
  expect((await listTaskQueue(db, {}, [], opts)).totalCount).toBe(1)
  sqlite.exec(
    "UPDATE locationIdentityReview SET rejection=NULL,ownerOrganisationId='other-org'",
  )
  expect((await listTaskQueue(db, {}, [], opts)).totalCount).toBe(1)
  sqlite.exec(
    "UPDATE locationIdentityReview SET ownerOrganisationId='org'; UPDATE location SET sourceAvailability='missing' WHERE id='l'",
  )
  expect((await listTaskQueue(db, {}, [], opts)).totalCount).toBe(1)
  sqlite.exec(
    "UPDATE location SET sourceAvailability='current' WHERE id='l'; INSERT INTO locationIdentityHistory VALUES('history','l',NULL,'identity')",
  )
  expect((await listTaskQueue(db, {}, [], opts)).totalCount).toBe(1)
})

it('adds all four explicit development mocks through the ordinary queue projection without inserting rows', async () => {
  const { db, opts } = setup()
  const result = await listTaskQueue(db, {}, [], {
    ...opts,
    mockLocationFeatureId: 'f',
  })
  expect(result.totalCount).toBe(5)
  expect(
    result.data
      .filter(row => row.locationTask?.mock)
      .map(row => row.type)
      .sort(),
  ).toEqual(['locationFacts', 'locationIdentity', 'locationMerge', 'locationPosition'])
  const readonly = await db.all(
    sql`${taskQueueProjection('unknown')} SELECT id FROM task`,
  )
  expect(readonly).toHaveLength(1)
  expect(sqlite.prepare('SELECT count(*) count FROM task').get()).toEqual({ count: 1 })
})

it('collapses repeated identity captures without reviving older reviews or combining different source evidence', async () => {
  const { db, opts } = setup()
  identity('first')
  identity('repeated')
  identity('another-candidate', 'other-source')
  identity('new-evidence')
  sqlite.exec(
    "UPDATE locationIdentityReview SET projection=json_set(projection,'$.snapshotId','new-snapshot') WHERE id='new-evidence'",
  )
  const pending = async () =>
    (await listTaskQueue(db, {}, [], opts)).data
      .flatMap(row => row.locationTask?.reviewId ?? [])
      .sort()
  expect(await pending()).toEqual(['another-candidate', 'new-evidence', 'repeated'])
  sqlite.exec("UPDATE locationIdentityReview SET rejection='{}' WHERE id='repeated'")
  expect(await pending()).toEqual(['another-candidate', 'new-evidence'])
  // Explicitly reconsidering a rejected candidate retains the source review's existing behavior.
  identity('reconsidered')
  expect(await pending()).toEqual(['another-candidate', 'new-evidence', 'reconsidered'])
})
it('shows occupancy-only proposals without a new facts version and removes only decided targets', async () => {
  const { db, opts } = setup()
  sqlite
    .prepare(
      `INSERT INTO locationAdoptionProposal(id,featureId,projectId,locationId,candidateRevisionId,organisationRevision,evidence,createdAt,occupancyRevisionId,addressRevisionId) VALUES('placement','f','p','l','old','',?,'2026-01-04','move',NULL)`,
    )
    .run(
      JSON.stringify({
        placement: { kind: 'relocation', membershipRevisionIds: [] },
        plan: { decision: { location: 'review' } },
      }),
    )
  sqlite.exec(
    "INSERT INTO locationOccupancy VALUES('move',NULL,'episode',NULL,'asserted')",
  )
  const pending = await listTaskQueue(db, {}, [], opts)
  expect(
    pending.data.some(row => row.id === 'locationPosition:placement:f:move:'),
  ).toBe(true)
  sqlite.exec(
    `UPDATE locationAdoptionProposal SET locationDecision='{"action":"rejected"}' WHERE id='placement'`,
  )
  expect((await listTaskQueue(db, {}, [], opts)).totalCount).toBe(1)
})

it('hydrates Location names for an untitled Feature without replacing authored Feature data', async () => {
  const { db, opts } = setup()
  proposal()
  sqlite.prepare("UPDATE locationRevision SET facts=? WHERE id='new'").run(
    JSON.stringify({
      common: { names: { en: 'Harbour Bakery', 'zh-hant': '海港餅店' } },
    }),
  )
  const result = await listTaskQueue(
    db,
    {},
    [eq(schema.task.type, 'locationFacts')],
    opts,
  )
  expect(result.data[0].images).toEqual([
    { taskId: result.data[0].id, imageId: 'photo', image: { id: 'photo' } },
  ])
  expect(result.data[0].locationTask?.locationKind).toBe('unknown')
  expect(result.data[0].locationTask?.names).toEqual({
    en: 'Harbour Bakery',
    'zh-hant': '海港餅店',
  })
})
