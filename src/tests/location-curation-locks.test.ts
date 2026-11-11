// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { afterEach, expect, it } from 'vitest'
// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import { assertCurationFieldsOpen } from '#lib/locations/curationLocks.js'
import { LocationFactsSchema } from '#lib/locations/validation.js'
// SERVICES
import {
  readLocationCurationLocks,
  saveLocationCurationLocks,
} from '#lib/db/services/locationCurationLocks.js'
import { prepareSharedLocationCorrection } from '#lib/db/services/locationShared.js'
import { executeRevisionBatch } from '#lib/db/services/revisionBatch.js'
// FIXTURES
import { publicationSqlite } from './fixtures/publicationSqlite'
// TYPES
import type { Database } from '#lib/types.js'
import type { CurationOpenFields } from '#lib/locations/curationLocks.js'
const stores: ReturnType<typeof publicationSqlite>[] = []
afterEach(() => {
  for (const f of stores.splice(0)) f.sqlite.close()
})
const facts = LocationFactsSchema.parse({
  names: { en: 'Original' },
  brands: [],
  phoneNumber: [],
  location: {
    geometry: { type: 'Point', coordinates: [114, 22] },
    address: {
      status: 'unresolved',
      address2dId: null,
      address3dId: null,
      address3dUnitId: null,
      snapshotId: null,
      rawSource: {},
      fallbackDisplay: { en: 'Original address' },
    },
  },
})
/** Create isolated source and community storage with the real lock migration.
 * @returns Database, source facts and authorized lock helper.
 */
function setup() {
  const f = publicationSqlite({})
  stores.push(f)
  f.sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE location(id TEXT PRIMARY KEY,state TEXT,kind TEXT);
    INSERT INTO location VALUES('place','linked','establishment'),('other','linked','establishment'),('internal','manual','establishment');
    CREATE TABLE locationRevision(id TEXT PRIMARY KEY,locationId TEXT,version INTEGER,facts TEXT,rawSource TEXT);
    CREATE TABLE locationSharedRevision(id TEXT PRIMARY KEY,locationId TEXT,previousRevisionId TEXT,sourceRevisionId TEXT,corrections TEXT,actorId TEXT,provenance TEXT,createdAt TEXT);
    CREATE VIEW locationSharedHead AS SELECT r.* FROM locationSharedRevision r WHERE NOT EXISTS(SELECT 1 FROM locationSharedRevision n WHERE n.previousRevisionId=r.id);`)
  f.sqlite.exec(readFileSync('migrations/0232_community_curation_locks.sql', 'utf8'))
  f.sqlite
    .prepare('INSERT INTO locationRevision VALUES(?,?,?,?,?)')
    .run('source', 'place', 1, JSON.stringify(facts), '{}')
  const db = f.db as unknown as Database
  return {
    ...f,
    db,
    input: {
      locationId: 'place',
      sourceRevisionId: 'source',
      expectedRevision: null,
      actorId: 'editor',
      rights: { canEdit: true, superAdmin: false },
      guard: sql`1`,
    },
    lock: (openFields: CurationOpenFields, expectedRevision: string | null = null) =>
      saveLocationCurationLocks(db, {
        locationId: 'place',
        expectedRevision,
        openFields,
        actorId: 'admin',
        superAdmin: true,
      }),
  }
}
it('starts open and only SuperAdmin may write attributed immutable lock history', async () => {
  const f = setup()
  expect(await readLocationCurationLocks(f.db, 'place')).toEqual({
    available: true,
    revision: null,
    openFields: {},
  })
  await expect(
    saveLocationCurationLocks(f.db, {
      locationId: 'place',
      expectedRevision: null,
      openFields: { names: false },
      actorId: 'editor',
      superAdmin: false,
    }),
  ).rejects.toThrow('SUPERADMIN')
  const locked = await f.lock({ names: false })
  expect(locked?.openFields.names).toBe(false)
  expect(
    f.sqlite.prepare('SELECT actorId FROM locationCurationLockHead').get()?.actorId,
  ).toBe('admin')
  expect(() =>
    f.sqlite.exec("UPDATE locationCurationLockRevision SET actorId='other'"),
  ).toThrow('immutable')
  expect(() => f.sqlite.exec('DELETE FROM locationCurationLockRevision')).toThrow(
    'immutable',
  )
  expect(await f.lock({ names: true })).toBeNull()
  const unlocked = await f.lock({ names: true }, locked?.revision)
  expect(unlocked?.openFields.names).toBe(true)
  expect(
    f.sqlite.prepare('SELECT count(*) n FROM locationCurationLockRevision').get()?.n,
  ).toBe(2)
})
it.each([false, true])(
  'rejects a locked name for editors and SuperAdmin alike (superAdmin=%s)',
  async superAdmin => {
    const f = setup()
    await f.lock({ names: false })
    await expect(
      prepareSharedLocationCorrection(f.db, {
        ...f.input,
        rights: { canEdit: true, superAdmin },
        patch: {
          names: { mode: 'override', value: { en: 'Changed' } },
          phoneNumber: { mode: 'override', value: ['+85221234567'] },
        },
      }),
    ).rejects.toThrow('COMMUNITY_CURATION_FIELD_LOCKED: names')
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM locationSharedRevision').get()?.n,
    ).toBe(0)
  },
)
it('permits open fields and rejects an edit prepared before a concurrent lock', async () => {
  const f = setup()
  const prepared = await prepareSharedLocationCorrection(f.db, {
    ...f.input,
    patch: { names: { mode: 'override', value: { en: 'Changed' } } },
  })
  const locked = await f.lock({ names: false })
  expect(await executeRevisionBatch(f.db, prepared.guard, prepared.queries)).toBeNull()
  const phone = await prepareSharedLocationCorrection(f.db, {
    ...f.input,
    patch: { phoneNumber: { mode: 'override', value: ['+85221234567'] } },
  })
  expect(await executeRevisionBatch(f.db, phone.guard, phone.queries)).not.toBeNull()
  expect((await readLocationCurationLocks(f.db, 'place')).revision).toBe(
    locked?.revision,
  )
})
it('locks address separately from marker and protects reset-to-inherit', async () => {
  const f = setup()
  await f.lock({ 'location.address': false })
  const marker = await prepareSharedLocationCorrection(f.db, {
    ...f.input,
    patch: {
      location: {
        mode: 'override',
        value: {
          ...facts.location,
          geometry: { type: 'Point', coordinates: [114.1, 22.1] },
        },
      },
    },
  })
  expect(await executeRevisionBatch(f.db, marker.guard, marker.queries)).not.toBeNull()
  await expect(
    prepareSharedLocationCorrection(f.db, {
      ...f.input,
      expectedRevision: marker.id,
      patch: { location: { mode: 'inherit' } },
    }),
  ).rejects.toThrow('location.address')
  expect(() =>
    assertCurationFieldsOpen(
      {
        location: {
          mode: 'override',
          value: {
            ...facts.location,
            address: { ...facts.location.address, fallbackDisplay: { en: 'Other' } },
          },
        },
      },
      facts,
      { 'location.address': false },
    ),
  ).toThrow('location.address')
})
it('does not allow nested establishment details to bypass identity field locks', () => {
  expect(() =>
    assertCurationFieldsOpen(
      {
        entity: {
          mode: 'override',
          value: {
            kind: 'establishment',
            details: { brands: [], branch: { en: 'New' } },
          },
        },
      },
      facts,
      { branch: false },
    ),
  ).toThrow('branch')
})
it('rejects internal Locations, invalid booleans and cross-Location history chains', async () => {
  const f = setup()
  expect(
    await saveLocationCurationLocks(f.db, {
      locationId: 'internal',
      expectedRevision: null,
      openFields: {},
      actorId: 'admin',
      superAdmin: true,
    }),
  ).toBeNull()
  const locked = await f.lock({ names: false })
  if (!locked?.revision) throw new Error('Expected a persisted lock revision')
  expect(() =>
    f.sqlite
      .prepare('INSERT INTO locationCurationLockRevision VALUES(?,?,?,?,?,?)')
      .run('bad', 'other', locked.revision, '{}', 'admin', 'now'),
  ).toThrow('changed')
  expect(() =>
    f.sqlite
      .prepare('INSERT INTO locationCurationLockRevision VALUES(?,?,?,?,?,?)')
      .run('bad', 'other', null, '{"names":0}', 'admin', 'now'),
  ).toThrow('boolean')
  expect(f.sqlite.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok')
  expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
