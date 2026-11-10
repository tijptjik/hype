// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { afterEach, expect, it } from 'vitest'
import { setupLifecycleDatabase } from './fixtures/locationLifecycleDatabase'
// DOMAIN
import {
  LocationTaxonomySchema,
  locationTaxonomy,
  locationMatchingType,
  expandLocationMatchingTypes,
} from '#lib/locations/taxonomy.js'
import { persistSaanSeoiPlace } from '#lib/db/services/locationSource.js'
import { createLocalLocation } from '#lib/db/services/locationLocal.js'
import {
  readLocationFacts,
  serializeLocationFacts,
} from '#lib/locations/factsSnapshot.js'

const stores: ReturnType<typeof setupLifecycleDatabase>[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.sqlite.close()
})

/** Rehearse the taxonomy migration over retained pre-taxonomy identities.
 * @param renameThoroughfare Whether to apply the class rename after the historical migration.
 * @returns Isolated D1-compatible database with the current taxonomy.
 */
function setup(renameThoroughfare = true) {
  const store = setupLifecycleDatabase()
  stores.push(store)
  store.sqlite.exec(readFileSync('migrations/0155_location_accessibility.sql', 'utf8'))
  const guard = readFileSync(
    'migrations/0144_location_address_contract.sql',
    'utf8',
  ).match(/CREATE TRIGGER location_revision_unknown_details[\s\S]*?END;/)?.[0]
  if (!guard) throw new Error('Missing historical unknown-details guard')
  store.sqlite.exec(guard)
  for (const migration of ['0213_building_parts', '0215_location_physical_kinds'])
    store.sqlite.exec(readFileSync(`migrations/${migration}.sql`, 'utf8'))
  store.sqlite.exec(`INSERT INTO location(id,kind,state,ownerOrganisationId) VALUES
    ('building','building','unresolved','p'),('nature','natural','unresolved','p'),
    ('infra','infrastructure','unresolved','p'),('shop','establishment','unresolved','p');`)
  store.sqlite.exec(
    'ALTER TABLE feature ADD COLUMN layerId TEXT; CREATE INDEX feature_target_context ON feature(layerId,targetContext);',
  )
  store.sqlite.exec(readFileSync('migrations/0216_location_taxonomy.sql', 'utf8'))
  if (renameThoroughfare)
    store.sqlite.exec(readFileSync('migrations/0217_location_thoroughfare.sql', 'utf8'))
  if (renameThoroughfare)
    store.sqlite.exec(
      readFileSync('migrations/0218_location_address_service_classes.sql', 'utf8'),
    )
  return store
}

it('migrates broad kinds without inventing subclasses and enforces valid pairs', () => {
  const { sqlite } = setup()
  expect(
    sqlite.prepare('SELECT id,kind,class FROM location ORDER BY id').all(),
  ).toEqual([
    { id: 'building', kind: 'built', class: 'building' },
    { id: 'infra', kind: 'built', class: null },
    { id: 'nature', kind: 'geographic', class: null },
    { id: 'shop', kind: 'operational', class: 'establishment' },
  ])
  expect(() =>
    sqlite.exec("UPDATE location SET class='water_feature' WHERE id='building'"),
  ).toThrow()
  expect(() =>
    sqlite.exec("UPDATE location SET class='building' WHERE id='shop'"),
  ).toThrow()
  expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})

it.each([
  'built',
  'structure',
  'landform',
  'coastal_feature',
  'water_feature',
  'building_part',
  'street',
  'service_point',
  'premises_address',
  'cadastral_address',
  'linear_reference',
] as const)('creates %s with canonical taxonomy and readable facts', async kind => {
  const { sqlite, db } = setup()
  const receipt = await createLocalLocation(
    db,
    'p',
    {
      state: 'unresolved',
      kind,
      ...(kind === 'building_part' ? { buildingId: 'building' } : {}),
      facts: {
        names: { en: 'Example' },
        brands: [],
        phoneNumber: [],
        location: {
          geometry: { type: 'Point', coordinates: [114.1, 22.3] },
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
      },
    },
    'actor',
  )
  expect(
    sqlite
      .prepare('SELECT kind,class FROM location WHERE id=?')
      .get(receipt.locationId),
  ).toEqual(locationTaxonomy(kind))
  const revision = sqlite
    .prepare('SELECT facts FROM locationRevision WHERE id=?')
    .get(receipt.revisionId)
  expect(readLocationFacts(revision?.facts).entity?.kind).toBe(kind)
  expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})

it('rejects invalid classifications rather than silently discarding a class', () => {
  expect(
    LocationTaxonomySchema.safeParse({ kind: 'operational', class: 'building' })
      .success,
  ).toBe(false)
  expect(
    LocationTaxonomySchema.safeParse({ kind: 'geographic', class: 'building' }).success,
  ).toBe(false)
  expect(locationTaxonomy('natural')).toEqual({ kind: 'geographic', class: null })
})

it('accepts canonical kind/class inputs and keeps building-part ownership guarded', async () => {
  const { db, sqlite } = setup()
  const facts = {
    names: { en: 'Unit' },
    brands: [],
    phoneNumber: [],
    location: {
      geometry: { type: 'Point', coordinates: [114.1, 22.3] },
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
  await expect(
    createLocalLocation(
      db,
      'p',
      { state: 'unresolved', kind: 'built', class: 'building_part', facts },
      'actor',
    ),
  ).rejects.toThrow()
  const result = await createLocalLocation(
    db,
    'p',
    {
      state: 'unresolved',
      kind: 'built',
      class: 'building_part',
      buildingId: 'building',
      facts,
    },
    'actor',
  )
  expect(
    sqlite.prepare('SELECT kind,class FROM location WHERE id=?').get(result.locationId),
  ).toEqual({ kind: 'built', class: 'building_part' })
  expect(() =>
    sqlite.exec("UPDATE location SET class='structure' WHERE id='building'"),
  ).toThrow(/Reconcile/)
  expect(() =>
    sqlite.exec(`UPDATE location SET class=NULL WHERE id='${result.locationId}'`),
  ).toThrow(/Reconcile/)
})

it('creates operational establishments and rejects unsupported operational classes', async () => {
  const { db, sqlite } = setup()
  const facts = {
    names: { en: 'Bakery' },
    brands: [],
    phoneNumber: [],
    location: {
      geometry: { type: 'Point', coordinates: [114.1, 22.3] },
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
  const result = await createLocalLocation(
    db,
    'p',
    { state: 'unresolved', kind: 'operational', class: 'establishment', facts },
    'actor',
  )
  expect(
    sqlite
      .prepare('SELECT kind,class,matchingType FROM location WHERE id=?')
      .get(result.locationId),
  ).toEqual({
    kind: 'operational',
    class: 'establishment',
    matchingType: 'establishment',
  })
  expect(
    LocationTaxonomySchema.safeParse({ kind: 'operational', class: 'not_a_class' })
      .success,
  ).toBe(false)
  expect(() => sqlite.exec("UPDATE location SET class=NULL WHERE id='shop'")).toThrow()
  await expect(
    createLocalLocation(
      db,
      'p',
      { state: 'unresolved', kind: 'operational', class: 'not_a_class', facts },
      'actor',
    ),
  ).rejects.toThrow()
})

it('imports a canonical place as an operational establishment without changing its source facts', async () => {
  const { db, sqlite } = setup()
  const source = {
    ssId: 'taxonomy-source',
    apiVersion: 'v0.1',
    releaseId: 'release1',
    snapshotId: 'snapshot1',
    rawSource: {},
    issues: [],
    facts: {
      names: { en: 'Source bakery' },
      brands: [],
      phoneNumber: [],
      location: {
        geometry: {
          type: 'Point' as const,
          coordinates: [114.1, 22.3] as [number, number],
        },
        address: {
          status: 'unresolved' as const,
          address2dId: null,
          address3dId: null,
          address3dUnitId: null,
          snapshotId: null,
          rawSource: {},
          fallbackDisplay: {},
        },
      },
    },
  }
  const result = await persistSaanSeoiPlace(db, source)
  expect(
    sqlite
      .prepare('SELECT kind,class,matchingType FROM location WHERE id=?')
      .get(result.locationId),
  ).toEqual({
    kind: 'operational',
    class: 'establishment',
    matchingType: 'establishment',
  })
  const revision = sqlite
    .prepare('SELECT facts FROM locationRevision WHERE id=?')
    .get(result.revisionId)
  expect(readLocationFacts(revision?.facts).names).toEqual(source.facts.names)
})

it('renames only the current street class while retaining matching and revision evidence', () => {
  const { sqlite } = setup(false)
  sqlite.exec(`INSERT INTO location(id,kind,class,state,ownerOrganisationId)
    VALUES('road','built','street','unresolved','p')`)
  const retainedFacts = serializeLocationFacts(
    {
      names: { en: 'Example path' },
      brands: [],
      phoneNumber: [],
      location: {
        geometry: { type: 'Point', coordinates: [114.1, 22.3] },
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
    },
    'street',
  )
  sqlite
    .prepare(`INSERT INTO locationRevision(id,locationId,version,origin,contentHash,rawSource,facts)
    VALUES('road-r1','road',1,'local','retained-hash','{}',?)`)
    .run(retainedFacts)
  const before = sqlite
    .prepare('SELECT id,kind,class,matchingType FROM location ORDER BY id')
    .all()
  const history = sqlite.prepare('SELECT * FROM locationRevision ORDER BY id').all()
  sqlite.exec(readFileSync('migrations/0217_location_thoroughfare.sql', 'utf8'))
  expect(
    sqlite.prepare('SELECT id,kind,class,matchingType FROM location ORDER BY id').all(),
  ).toEqual(
    before.map(row => ({
      ...row,
      class: row.class === 'street' ? 'thoroughfare' : row.class,
    })),
  )
  expect(sqlite.prepare('SELECT * FROM locationRevision ORDER BY id').all()).toEqual(
    history,
  )
  expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  expect(sqlite.prepare('PRAGMA integrity_check').get()).toEqual({
    integrity_check: 'ok',
  })
  expect(() =>
    sqlite.exec("UPDATE location SET class='street' WHERE id='road'"),
  ).toThrow()
  expect(locationTaxonomy('street')).toEqual({ kind: 'built', class: 'thoroughfare' })
  expect(locationMatchingType({ kind: 'built', class: 'thoroughfare' })).toBe('street')
  expect(expandLocationMatchingTypes(['built'])).toContain('street')
  expect(expandLocationMatchingTypes(['thoroughfare'])).toEqual(['street'])
})
