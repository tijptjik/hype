// @vitest-environment node
// TESTS
import { afterEach, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { lifecycleFixture } from './fixtures/featureLifecycle'
import {
  prepareStaffLocationPropagation,
  replayStaffLocationCorrection,
} from '#lib/db/services/locationStaffPropagation.js'
import {
  executeRevisionBatch,
  prepareRevisionCheck,
} from '#lib/db/services/revisionBatch.js'
import { readCurrentFeatureRevision } from '#lib/db/services/featureLifecycle.js'
import { LocationFactsSchema } from '#lib/locations/validation.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'

const stores: ReturnType<typeof lifecycleFixture>[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.sqlite.close()
})
const oldGeometry = { type: 'Point' as const, coordinates: [114, 22] }
const geometry = { type: 'Point' as const, coordinates: [114.01, 22.01] }
const facts = LocationFactsSchema.parse({
  names: { en: 'Service point' },
  phoneNumber: [],
  brands: [],
  location: { geometry, address: emptyFeatureAddress().source },
})

/** Arrange a live linked Feature with the same stale discovery-placement flag as the reported record.
 * @param mode Explicit manual placement or copied discovery evidence.
 * @returns Isolated lifecycle database and prepared propagation input.
 */
async function setup(mode: 'manual' | 'unlinked' = 'unlinked') {
  const f = lifecycleFixture(true)
  stores.push(f)
  f.sqlite.exec(`CREATE TABLE locationRevision(id TEXT PRIMARY KEY,locationId TEXT,facts TEXT,version INTEGER DEFAULT 1);
    CREATE TABLE locationRefreshItem(runId TEXT,locationId TEXT,origin TEXT,status TEXT);
    INSERT INTO locationRefreshItem VALUES('shared:staff','place','local','pending');
    DELETE FROM featureLocationMembership;
    UPDATE featureLocation SET occupancyRevisionId=NULL,addressRevisionId=NULL,membershipRevisionIds='[]',
      factsOrganisationRevision=NULL,locationOrganisationRevision=NULL,
      acceptancePolicy='{"nameMode":"independent","locationMode":"independent"}';`)
  f.sqlite
    .prepare('INSERT INTO locationRevision(id,locationId,facts) VALUES(?,?,?)')
    .run('facts-v1', 'place', JSON.stringify(facts))
  f.sqlite.prepare('UPDATE feature SET addressMeta=? WHERE id=?').run(
    JSON.stringify({
      address: {
        ...emptyFeatureAddress(),
        coordinates: oldGeometry.coordinates,
        markerCoordinates: oldGeometry.coordinates,
        association: {
          originKind: 'building',
          kind: 'service_point',
          mode,
          lookup: 'no-match',
          names: {},
        },
      },
    }),
    'f',
  )
  await f.initialize()
  return {
    ...f,
    input: {
      locationId: 'place',
      sourceRevisionId: 'facts-v1',
      sharedRevisionId: 'staff',
      actorId: 'staff',
      facts,
      fields: ['location'],
    },
  }
}

it('updates the marker, accepted pin, address and history without a review or visibility change', async () => {
  const f = await setup()
  const before = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  const prepared = await prepareStaffLocationPropagation(f.db, f.input)
  expect(
    await executeRevisionBatch(f.db, prepared.guard, prepared.statements),
  ).not.toBeNull()
  const after = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  expect(after?.content.placement.geometry).toEqual(geometry)
  expect(after?.content.placement.location?.acceptedGeometry).toEqual(geometry)
  expect(after?.content.placement.addressMeta?.address).toMatchObject({
    coordinates: null,
  })
  expect(after?.content.placement.addressMeta?.address).not.toHaveProperty(
    'markerCoordinates',
  )
  expect(
    after?.content.placement.location?.acceptancePolicy?.locationMode,
  ).toBeUndefined()
  expect(
    after?.content.placement.location?.acceptancePolicy?.locationSharedRevision,
  ).toBe('staff')
  expect(after?.content.translations.en.title).toEqual(
    before?.content.translations.en.title,
  )
  expect(after?.state).toEqual(before?.state)
  expect(after?.revisionId).not.toBe(before?.revisionId)
  expect(
    f.sqlite
      .prepare(`SELECT c.reason FROM featureRevision r
      JOIN revisionChangeSet c ON c.id=r.changeSetId WHERE r.id=?`)
      .get(after?.revisionId ?? '')?.reason,
  ).toBe('Staff updated location')
  expect(
    f.sqlite.prepare('SELECT count(*) n FROM featureRevisionProposal').get()?.n,
  ).toBe(0)
  expect(f.sqlite.prepare('SELECT status FROM locationRefreshItem').get()?.status).toBe(
    'processed',
  )
})

it('retains an explicitly manual marker', async () => {
  const f = await setup('manual')
  const prepared = await prepareStaffLocationPropagation(f.db, f.input)
  expect(
    await executeRevisionBatch(f.db, prepared.guard, prepared.statements),
  ).not.toBeNull()
  const after = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  expect(after?.content.placement.geometry).toEqual(oldGeometry)
  expect(
    after?.content.placement.location?.acceptancePolicy?.locationSharedRevision,
  ).toBeUndefined()
})

it('rolls back the marker, history and refresh receipt if a later statement fails', async () => {
  const f = await setup()
  const before = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  const prepared = await prepareStaffLocationPropagation(f.db, f.input)
  await expect(
    executeRevisionBatch(f.db, prepared.guard, [
      ...prepared.statements,
      prepareRevisionCheck(f.db, sql`0`),
    ]),
  ).resolves.toBeNull()
  expect(
    await readCurrentFeatureRevision(f.db, { featureId: 'f', guard: sql`1` }),
  ).toEqual(before)
  expect(f.sqlite.prepare('SELECT status FROM locationRefreshItem').get()?.status).toBe(
    'pending',
  )
})

it('rejects a changed association set instead of missing a concurrent linked Feature', async () => {
  const f = await setup()
  const prepared = await prepareStaffLocationPropagation(f.db, f.input)
  const concurrent = await prepareStaffLocationPropagation(f.db, {
    ...f.input,
    sharedRevisionId: 'concurrent',
  })
  expect(
    await executeRevisionBatch(f.db, concurrent.guard, concurrent.statements),
  ).not.toBeNull()
  expect(
    await executeRevisionBatch(f.db, prepared.guard, prepared.statements),
  ).toBeNull()
  expect(f.sqlite.prepare('SELECT status FROM locationRefreshItem').get()?.status).toBe(
    'pending',
  )
})

it.each(['source-policy-reconcile', 'location-editor'])(
  'does not replay %s evidence over a newer upstream source',
  async kind => {
    const f = await setup()
    f.sqlite.exec(
      `CREATE TABLE locationSharedRevision(id TEXT,locationId TEXT,sourceRevisionId TEXT,previousRevisionId TEXT,corrections TEXT,actorId TEXT,createdAt TEXT,provenance TEXT);`,
    )
    f.sqlite
      .prepare('INSERT INTO locationSharedRevision VALUES(?,?,?,?,?,?,?,?)')
      .run(
        'staff',
        'place',
        'older-source',
        null,
        '{}',
        'staff',
        'now',
        JSON.stringify({ kind }),
      )
    const before = await readCurrentFeatureRevision(f.db, {
      featureId: 'f',
      guard: sql`1`,
    })
    expect(await replayStaffLocationCorrection(f.db, 'place', 'staff')).toBeNull()
    expect(
      await readCurrentFeatureRevision(f.db, { featureId: 'f', guard: sql`1` }),
    ).toEqual(before)
    expect(
      f.sqlite.prepare('SELECT status FROM locationRefreshItem').get()?.status,
    ).toBe('pending')
  },
)
