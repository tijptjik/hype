// @vitest-environment node
import { readFileSync } from 'node:fs'
import { afterEach, expect, it } from 'vitest'
import { setupLifecycleDatabase } from './fixtures/locationLifecycleDatabase'
import { createLocalLocation } from '#lib/db/services/locationLocal.js'
import { appendLocationRelationship } from '#lib/db/services/locationRelationships.js'
import { listLocationLinkedFeatures } from '#lib/db/services/locationFeatures.js'
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
import type { RelationshipInput } from '#lib/locations/relationships.js'

const stores: ReturnType<typeof setupLifecycleDatabase>[] = []
afterEach(() => {
  for (const s of stores.splice(0)) s.sqlite.close()
})
function setup() {
  const s = setupLifecycleDatabase()
  stores.push(s)
  s.sqlite.exec(readFileSync('migrations/0155_location_accessibility.sql', 'utf8'))
  s.sqlite.exec(
    readFileSync('migrations/0144_location_address_contract.sql', 'utf8').match(
      /CREATE TRIGGER location_revision_unknown_details[\s\S]*?END;/,
    )![0],
  )
  s.sqlite.exec(readFileSync('migrations/0213_building_parts.sql', 'utf8'))
  s.sqlite.exec(`INSERT INTO location(id,kind,state,ownerOrganisationId) VALUES
    ('building','building','unresolved','p'),('other-building','building','unresolved','p'),
    ('tenant','establishment','unresolved','p'),('next-tenant','establishment','unresolved','p'),
    ('private-building','building','manual','other'),('address','address','unresolved','p');`)
  s.sqlite.exec(
    'ALTER TABLE feature ADD COLUMN layerId TEXT; CREATE INDEX feature_target_context ON feature(layerId,targetContext);',
  )
  s.sqlite.exec(readFileSync('migrations/0215_location_physical_kinds.sql', 'utf8'))
  s.sqlite.exec(readFileSync('migrations/0216_location_taxonomy.sql', 'utf8'))
  return s
}
function part(name: string, parentPartId?: string, buildingId = 'building') {
  return {
    state: 'unresolved',
    kind: 'building_part',
    buildingId,
    parentPartId,
    facts: {
      names: { en: name },
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
  }
}
const common = {
  previousRevisionId: null,
  scopeOrganisationId: null,
  assertionState: 'asserted' as const,
  evidence: [],
  observedAt: null,
  verifiedAt: null,
  effectiveFrom: null,
  effectiveTo: null,
}
function membership(
  id: string,
  childLocationId: string,
  parentLocationId: string,
): RelationshipInput {
  return {
    ...common,
    table: 'locationMembership',
    id,
    relationshipId: id,
    childLocationId,
    parentLocationId,
    membershipState: 'current',
  }
}
function occupancy(
  id: string,
  establishmentLocationId: string,
  containerLocationId: string,
): RelationshipInput {
  return {
    ...common,
    table: 'locationOccupancy',
    id,
    relationshipId: id,
    establishmentLocationId,
    containerLocationId,
    addressRevisionId: null,
    occupancyState: 'current',
  }
}
it('creates floor, named wing and direct room identities without occupants or complete addresses', async () => {
  const { db, sqlite } = setup()
  for (const name of ['3/F, Example Building', 'East Wing', 'Room 302']) {
    const created = await createLocalLocation(db, 'p', part(name), 'author')
    const row = sqlite
      .prepare('SELECT facts FROM locationRevision WHERE id=?')
      .get(created.revisionId)!
    expect(readLocationFacts(row.facts).names.en).toBe(name)
    expect(
      sqlite
        .prepare(
          'SELECT parentLocationId FROM locationMembership WHERE childLocationId=?',
        )
        .get(created.locationId)?.parentLocationId,
    ).toBe('building')
  }
  expect(sqlite.prepare('SELECT count(*) n FROM locationOccupancy').get()?.n).toBe(0)
  expect(
    sqlite.prepare("SELECT matchingType AS kind FROM location WHERE id='address'").get()
      ?.kind,
  ).toBe('address')
})
it('resolves nested parts to one building and atomically rejects invalid ownership and cycles', async () => {
  const { db, sqlite } = setup()
  const wing = await createLocalLocation(db, 'p', part('East Wing'), 'author')
  const floor = await createLocalLocation(
    db,
    'p',
    part('3/F', wing.locationId),
    'author',
  )
  const room = await createLocalLocation(
    db,
    'p',
    part('Room', floor.locationId),
    'author',
  )
  expect(
    sqlite
      .prepare(
        "SELECT count(*) n FROM locationMembership WHERE parentLocationId='building'",
      )
      .get()?.n,
  ).toBe(3)
  await expect(
    appendLocationRelationship(
      db,
      membership('cycle', wing.locationId, room.locationId),
      'author',
    ),
  ).rejects.toThrow()
  await expect(
    appendLocationRelationship(
      db,
      membership('self', room.locationId, room.locationId),
      'author',
    ),
  ).rejects.toThrow()
  await expect(
    appendLocationRelationship(
      db,
      membership('wrong-building', room.locationId, 'other-building'),
      'author',
    ),
  ).rejects.toThrow()
  await expect(
    createLocalLocation(
      db,
      'p',
      part('Wrong parent', floor.locationId, 'other-building'),
      'author',
    ),
  ).rejects.toThrow()
  await expect(
    createLocalLocation(
      db,
      'p',
      part('Private', undefined, 'private-building'),
      'author',
    ),
  ).rejects.toThrow()
  await expect(
    createLocalLocation(
      db,
      'p',
      { ...part('Missing'), buildingId: undefined },
      'author',
    ),
  ).rejects.toThrow()
  expect(
    sqlite
      .prepare("SELECT count(*) n FROM location WHERE matchingType='building_part'")
      .get()?.n,
  ).toBe(3)
})
it('aggregates current occupants and direct part features once, enforces read access and preserves identity at turnover', async () => {
  const { db, sqlite } = setup()
  const floor = await createLocalLocation(db, 'p', part('3/F'), 'author')
  const room = await createLocalLocation(
    db,
    'p',
    part('Room', floor.locationId),
    'author',
  )
  await appendLocationRelationship(
    db,
    occupancy('lease', 'tenant', room.locationId),
    'author',
  )
  await appendLocationRelationship(
    db,
    occupancy('direct-lease', 'tenant', 'building'),
    'author',
  )
  // Minimal Feature fixtures preserve real membership/occupancy constraints and exercise the listing SQL.
  sqlite.exec(`ALTER TABLE organisation ADD COLUMN hubId TEXT;
    UPDATE feature SET layerId='layer';
    ALTER TABLE feature ADD COLUMN isPublished INTEGER DEFAULT 1;
    CREATE TABLE projectI18n(projectId TEXT,locale TEXT,name TEXT,nameShort TEXT);
    CREATE TABLE layerI18n(layerId TEXT,locale TEXT,name TEXT,nameShort TEXT);
    DROP TABLE featureLocationMembership;
    DROP TABLE featureLocation;
    CREATE TABLE featureLocation(featureId TEXT PRIMARY KEY,locationId TEXT);
    INSERT INTO feature(id,projectId) VALUES ('direct','p'),('occupied','p'),('hidden','p');`)
  sqlite
    .prepare('INSERT INTO featureLocation VALUES(?,?)')
    .run('direct', room.locationId)
  sqlite.prepare('INSERT INTO featureLocation VALUES(?,?)').run('occupied', 'tenant')
  sqlite
    .prepare('INSERT INTO featureLocation VALUES(?,?)')
    .run('hidden', floor.locationId)
  const list = () =>
    listLocationLinkedFeatures(db, {
      locationId: 'building',
      locale: 'en',
      canRead: row => row.id !== 'hidden',
    })
  expect((await list()).data.map(r => r.id)).toEqual(['direct', 'occupied'])
  for (const id of ['lease', 'direct-lease'])
    await appendLocationRelationship(
      db,
      {
        ...occupancy(id, 'tenant', id === 'lease' ? room.locationId : 'building'),
        id: `${id}-ended`,
        previousRevisionId: id,
        occupancyState: 'former',
      } as RelationshipInput,
      'author',
    )
  await appendLocationRelationship(
    db,
    occupancy('replacement', 'next-tenant', room.locationId),
    'author',
  )
  expect((await list()).data.map(r => r.id)).toEqual(['direct'])
  expect(
    sqlite
      .prepare('SELECT matchingType AS kind FROM location WHERE id=?')
      .get(room.locationId)?.kind,
  ).toBe('building_part')
  expect(
    sqlite
      .prepare("SELECT locationId FROM featureLocation WHERE featureId='direct'")
      .get()?.locationId,
  ).toBe(room.locationId)
})
it('retains floor-only authored address components without upstream identity and forbids ownership suppression', async () => {
  const { db, sqlite } = setup()
  const input = part('3/F')
  const created = await createLocalLocation(
    db,
    'p',
    {
      ...input,
      facts: {
        ...input.facts,
        location: {
          ...input.facts.location,
          address: {
            ...input.facts.location.address,
            authored: {
              scope: 'floor',
              i18n: { en: { formattedAddress: '3/F' } },
              unit: {
                floorRef: '3',
                floorType: 'F',
                unitRef: '',
                unitType: 'X',
                unitPortion: null,
              },
              unitI18n: {},
            },
          },
        },
      },
    },
    'author',
  )
  const facts = readLocationFacts(
    sqlite
      .prepare('SELECT facts FROM locationRevision WHERE id=?')
      .get(created.revisionId)!.facts,
  )
  expect(facts.location.address.authored?.unit?.floorRef).toBe('3')
  expect(facts.location.address.address3dId).toBeNull()
  const owner = sqlite
    .prepare('SELECT id FROM locationMembership WHERE childLocationId=?')
    .get(created.locationId)!.id as string
  await expect(
    appendLocationRelationship(
      db,
      {
        ...membership(owner, created.locationId, 'building'),
        id: 'suppress',
        previousRevisionId: owner,
        assertionState: 'suppressed',
      },
      'author',
    ),
  ).rejects.toThrow()
  await expect(
    appendLocationRelationship(
      db,
      {
        ...membership(owner, 'other-building', 'building'),
        id: 'replace-child',
        previousRevisionId: owner,
      },
      'author',
    ),
  ).rejects.toThrow()
})
it('captures accepted building ancestry from nested parts without misclassifying it as premises', async () => {
  const { db, sqlite } = setup()
  const floor = await createLocalLocation(db, 'p', part('Floor'), 'author')
  const room = await createLocalLocation(
    db,
    'p',
    part('Room', floor.locationId),
    'author',
  )
  const ids = sqlite
    .prepare('SELECT id FROM locationMembership')
    .all()
    .map(r => r.id as string)
  const { prepareFeatureLocationAssociationWrite } = await import(
    '#lib/db/services/locationAssociation.js'
  )
  const { readFeatureLocationRevisionMemberships } = await import(
    '#lib/db/services/featureLocationRevision.js'
  )
  const write = prepareFeatureLocationAssociationWrite(db, {
    featureId: 'f',
    projectId: 'p',
    expectedFeatureModifiedAt: 'original',
    expectedRevision: null,
    locationId: room.locationId,
    factsRevisionId: room.revisionId,
    locationRevisionId: room.revisionId,
    overrides: {},
    actorId: 'author',
    membershipRevisionIds: ids,
  })
  await write.query
  const expected = await readFeatureLocationRevisionMemberships(db, {
    locationId: room.locationId,
    associationVersion: write.version,
    occupancyRevisionId: null,
    membershipRevisionIds: ids,
  })
  expect(expected).toHaveLength(1)
  expect(expected[0]).toMatchObject({
    containerLocationId: 'building',
    role: 'building',
  })
  expect(
    sqlite
      .prepare('SELECT containerLocationId,role FROM featureLocationMembership')
      .all(),
  ).toEqual([{ containerLocationId: 'building', role: 'building' }])
})
