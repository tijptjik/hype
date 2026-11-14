// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// DRIZZLE
import { sql } from 'drizzle-orm'
// TESTS
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { publicationSqlite } from './fixtures/publicationSqlite'
// SERVICES
import { createLocalLocation } from '#lib/db/services/locationLocal.js'
import { persistSaanSeoiPlace } from '#lib/db/services/locationSource.js'
import type { LocationFacts } from '#lib/locations/model.js'
vi.mock('#lib/db/services/identityCatalogueImport', () => ({
  linkImportedLocationBrands: async () => undefined,
}))
import {
  markLocationUnavailable,
  resetLocationUnavailable,
  pendingLocationReconciliation,
  readLocationReconciliationProgress,
} from '#lib/db/services/locationReconciliation.js'
// TYPES
import type { Database } from '#lib/types.js'
let fixture: ReturnType<typeof publicationSqlite>
let db: Database
const input = {
  projectId: 'p',
  featureId: 'one',
  locationId: 'local',
  ownerOrganisationId: 'org',
}
beforeEach(() => {
  fixture = publicationSqlite({}, 100)
  db = fixture.db as unknown as Database
  fixture.sqlite.exec(`
    CREATE TABLE location(id TEXT PRIMARY KEY,ownerOrganisationId TEXT,state TEXT,ssId TEXT,sourceAvailability TEXT,kind TEXT DEFAULT 'unknown',class TEXT,matchingType TEXT GENERATED ALWAYS AS(coalesce(class,kind)),redirectTargetId TEXT,redirect TEXT,createdAt TEXT);
    CREATE TABLE locationRevisionContent(id TEXT PRIMARY KEY,locationId TEXT,version INTEGER,origin TEXT,ssId TEXT,apiVersion TEXT,releaseId TEXT,snapshotId TEXT,contentHash TEXT,rawSource TEXT,facts TEXT,createdAt TEXT);
    CREATE VIEW locationRevision AS SELECT * FROM locationRevisionContent;
    CREATE TABLE locationIdentityHistory(id TEXT PRIMARY KEY,previousSsId TEXT);
    CREATE TABLE feature(id TEXT PRIMARY KEY,projectId TEXT,isArchived INTEGER,authoredName TEXT);
    CREATE TABLE featureLocation(featureId TEXT PRIMARY KEY,locationId TEXT,factsRevisionId TEXT);
    INSERT INTO location(id,ownerOrganisationId,state,ssId,sourceAvailability) VALUES ('local','org','unresolved',NULL,'current'),('linked',NULL,'linked','upstream','current'),('other','other-org','manual',NULL,'current');
    INSERT INTO feature VALUES ('one','p',0,'One'),('two','p',0,'Two'),('linked','p',0,'Linked'),('missing','p',0,'Missing'),('archived','p',1,'Archived'),('foreign','other',0,'Other');
    INSERT INTO featureLocation VALUES ('one','local','accepted-1'),('two','local','accepted-2'),('linked','linked','accepted-3'),('archived','local','accepted-4'),('foreign','other','accepted-5');
  `)
  fixture.sqlite.exec(
    readFileSync('migrations/0249_location_manual_match_attempt.sql', 'utf8'),
  )
})
afterEach(() => fixture.sqlite.close())

it('starts unattempted and removes every associated active Feature only after an explicit unavailable disposition', async () => {
  expect(await readLocationReconciliationProgress(db, 'p')).toEqual({
    total: 4,
    matched: 1,
    unavailable: 0,
    remaining: 3,
  })
  const before = fixture.sqlite
    .prepare('SELECT * FROM featureLocation ORDER BY featureId')
    .all()
  const result = await markLocationUnavailable(db, input)
  expect(result?.lastManualMatchAttemptAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
  expect(await readLocationReconciliationProgress(db, 'p')).toEqual({
    total: 4,
    matched: 1,
    unavailable: 2,
    remaining: 1,
  })
  expect(
    await db.all(
      sql`SELECT f.id FROM feature f LEFT JOIN featureLocation fl ON fl.featureId=f.id LEFT JOIN location l ON l.id=fl.locationId WHERE f.projectId='p' AND f.isArchived=0 AND ${pendingLocationReconciliation}`,
    ),
  ).toEqual([{ id: 'missing' }])
  expect(
    fixture.sqlite.prepare('SELECT * FROM featureLocation ORDER BY featureId').all(),
  ).toEqual(before)
  expect(
    fixture.sqlite
      .prepare("SELECT state,ssId,sourceAvailability FROM location WHERE id='local'")
      .get(),
  ).toEqual({ state: 'unresolved', ssId: null, sourceAvailability: 'current' })
  expect(await markLocationUnavailable(db, input)).toEqual(result)
})
it('counts a subsequently linked Location as matched rather than unavailable', async () => {
  await markLocationUnavailable(db, input)
  fixture.sqlite.exec(
    "UPDATE location SET state='linked',ssId='new-source' WHERE id='local'",
  )
  expect(await readLocationReconciliationProgress(db, 'p')).toEqual({
    total: 4,
    matched: 3,
    unavailable: 0,
    remaining: 1,
  })
  expect(await markLocationUnavailable(db, input)).toBeNull()
})
it.each(['owner', 'association', 'project', 'archived'])(
  'rejects a stale %s at the atomic write',
  async changed => {
    if (changed === 'owner')
      fixture.sqlite.exec(
        "UPDATE location SET ownerOrganisationId='other-org' WHERE id='local'",
      )
    if (changed === 'association')
      fixture.sqlite.exec(
        "UPDATE featureLocation SET locationId='other' WHERE featureId='one'",
      )
    if (changed === 'project')
      fixture.sqlite.exec("UPDATE feature SET projectId='other' WHERE id='one'")
    if (changed === 'archived')
      fixture.sqlite.exec("UPDATE feature SET isArchived=1 WHERE id='one'")
    expect(await markLocationUnavailable(db, input)).toBeNull()
    expect(
      fixture.sqlite
        .prepare("SELECT lastManualMatchAttemptAt FROM location WHERE id='local'")
        .get(),
    ).toEqual({ lastManualMatchAttemptAt: null })
  },
)

/** Minimal authored facts for testing the actual Location insert column order. @returns Valid local facts. */
function creationFacts(): LocationFacts {
  return {
    names: { en: 'Bakery' },
    phoneNumber: [],
    brands: [],
    location: {
      geometry: { type: 'Point', coordinates: [114, 22] },
      address: {
        status: 'unresolved',
        address2dId: null,
        address3dId: null,
        address3dUnitId: null,
        snapshotId: null,
        rawSource: {},
        fallbackDisplay: {},
      },
    },
  }
}
it('keeps local Location creation aligned with the expanded schema and starts unattempted', async () => {
  const result = await createLocalLocation(
    db,
    'org',
    { state: 'unresolved', kind: 'establishment', facts: creationFacts() },
    'actor',
  )
  expect(
    fixture.sqlite
      .prepare(
        'SELECT state,kind,class,lastManualMatchAttemptAt,redirectTargetId,redirect,createdAt FROM location WHERE id=?',
      )
      .get(result.locationId),
  ).toMatchObject({
    state: 'unresolved',
    kind: 'operational',
    class: 'establishment',
    lastManualMatchAttemptAt: null,
    redirectTargetId: null,
    redirect: null,
    createdAt: expect.stringMatching(/^\d{4}-/),
  })
})
it('keeps upstream Location import aligned with the expanded schema and preserves a recorded timestamp on refresh', async () => {
  const projection = {
    ssId: 'source-new',
    apiVersion: 'v0.1',
    releaseId: 'release',
    snapshotId: 'snapshot',
    facts: creationFacts(),
    rawSource: {},
    issues: [],
  }
  const result = await persistSaanSeoiPlace(db, projection)
  expect(
    fixture.sqlite
      .prepare(
        'SELECT state,lastManualMatchAttemptAt,createdAt FROM location WHERE id=?',
      )
      .get(result.locationId),
  ).toMatchObject({
    state: 'linked',
    lastManualMatchAttemptAt: null,
    createdAt: expect.stringMatching(/^\d{4}-/),
  })
  fixture.sqlite
    .prepare('UPDATE location SET lastManualMatchAttemptAt=? WHERE id=?')
    .run('2026-11-01T00:00:00.000Z', result.locationId)
  await persistSaanSeoiPlace(db, projection)
  expect(
    fixture.sqlite
      .prepare('SELECT lastManualMatchAttemptAt FROM location WHERE id=?')
      .get(result.locationId),
  ).toEqual({ lastManualMatchAttemptAt: '2026-11-01T00:00:00.000Z' })
})

it('resets a shared unavailable Location without changing its accepted associations', async () => {
  await markLocationUnavailable(db, input)
  const before = fixture.sqlite
    .prepare('SELECT * FROM featureLocation ORDER BY featureId')
    .all()
  expect(
    await resetLocationUnavailable(db, { ...input, projectId: 'wrong' }),
  ).toBeNull()
  expect((await readLocationReconciliationProgress(db, 'p')).unavailable).toBe(2)
  expect(await resetLocationUnavailable(db, input)).toEqual({ id: 'local' })
  expect(await readLocationReconciliationProgress(db, 'p')).toEqual({
    total: 4,
    matched: 1,
    unavailable: 0,
    remaining: 3,
  })
  expect(
    fixture.sqlite.prepare('SELECT * FROM featureLocation ORDER BY featureId').all(),
  ).toEqual(before)
  expect(await resetLocationUnavailable(db, input)).toEqual({ id: 'local' })
})
