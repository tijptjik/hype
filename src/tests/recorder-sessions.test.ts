// @vitest-environment node
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  listRecorderLocations,
  listRecorderRecords,
  listRecorderSessions,
} from '#lib/db/services/recorderSessions.js'
import { resolveRecorderPoint } from '#lib/db/services/recorderPlacement.js'
import { recorderIdentifierTags } from '#lib/fieldResearch/recorderIdentifier.js'
import { mapHash } from '#lib/indoor/releases.js'
import type { FacadePin, InteriorPin } from '#lib/fieldResearch/recorder.js'
import { publicationSqlite } from './fixtures/publicationSqlite'
import type { Database, UserRoleDisco } from '#lib/types.js'

const stores: ReturnType<typeof publicationSqlite>[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.sqlite.close()
})

function fixture() {
  const store = publicationSqlite({}, 100)
  stores.push(store)
  const { sqlite } = store
  sqlite.exec(`CREATE TABLE organisation(id TEXT PRIMARY KEY,hubId TEXT);
    CREATE TABLE project(id TEXT PRIMARY KEY,organisationId TEXT);
    CREATE TABLE fieldResearchSession(id TEXT PRIMARY KEY,name TEXT,organisationId TEXT,projectId TEXT,updatedAt TEXT,status TEXT,isArchived INTEGER);
    INSERT INTO organisation VALUES('o','h'),('other','other-hub');
    INSERT INTO project VALUES('p','o'),('sibling','o'),('foreign','other');
    INSERT INTO fieldResearchSession VALUES ('a','內部名稱','o','p','2025','uploading',0),
      ('b','Second','o','p','2026','organising',0),('c','Sibling','o','sibling','2024','completed',0),
      ('x','Foreign','other','foreign','2026','uploading',0),('archived','Archived','o','p','2027','uploading',1);`)
  sqlite.exec(readFileSync('migrations/0265_field_research_record.sql', 'utf8'))
  sqlite.exec(`CREATE TABLE layer(id TEXT,projectId TEXT,organisationId TEXT,isArchived INTEGER,historicalSourceLayerId TEXT);
    CREATE TABLE layerI18n(layerId TEXT,name TEXT,locale TEXT);
    CREATE TABLE fieldResearchSessionLayer(sessionId TEXT,layerId TEXT);
    ALTER TABLE fieldResearchSession ADD COLUMN layerId TEXT;
    ALTER TABLE fieldResearchSession ADD COLUMN configuration TEXT;
    ALTER TABLE fieldResearchSession ADD COLUMN code TEXT;
    CREATE TABLE feature(id TEXT PRIMARY KEY);
    CREATE TABLE featureI18n(featureId TEXT,locale TEXT,title TEXT);`)
  sqlite.exec(readFileSync('migrations/0266_field_research_features.sql', 'utf8'))
  sqlite.exec(
    readFileSync('migrations/0267_field_research_record_placement.sql', 'utf8'),
  )
  sqlite.exec(readFileSync('migrations/0276_field_research_record_archive.sql', 'utf8'))
  const actor = (role: object) => ({
    db: store.db as unknown as Database,
    user: { id: 'reader' },
    userRoles: [role] as UserRoleDisco[],
  })
  const maintainer = actor({ type: 'project', role: 'maintainer', projectId: 'p' })
  return { sqlite, actor, maintainer }
}

function locationFixture() {
  const { sqlite, maintainer } = fixture()
  sqlite.exec(`CREATE TABLE location(id TEXT PRIMARY KEY,matchingType TEXT,state TEXT,ownerOrganisationId TEXT,redirectTargetId TEXT);
      CREATE TABLE fieldResearchSessionLocation(sessionId TEXT,locationId TEXT);
      CREATE TABLE locationExteriorModel(locationId TEXT,assetId TEXT,sourceModelId TEXT);
      INSERT INTO locationExteriorModel VALUES('building:tower','asset','assembly');
      CREATE TABLE premisesMap(id TEXT,name TEXT,publishedHash TEXT);
      CREATE TABLE premisesMapUnit(locationId TEXT,mapId TEXT,unitId TEXT);
      CREATE TABLE locationPremisesMap(locationId TEXT,mapId TEXT);
      INSERT INTO premisesMap VALUES('plan','Tower','published'),('draft','Draft',NULL);
      INSERT INTO premisesMapUnit VALUES('lift','plan','unit-one'),('solo','draft','draft-unit');
      INSERT INTO locationPremisesMap VALUES('building:tower','plan');
      CREATE TABLE locationMembershipHead(childLocationId TEXT,parentLocationId TEXT,scopeOrganisationId TEXT,relationshipId TEXT,assertionState TEXT,membershipState TEXT,effectiveFrom TEXT,effectiveTo TEXT);
      CREATE TABLE locationRevision(id TEXT,locationId TEXT,version INTEGER,origin TEXT,facts TEXT,rawSource TEXT);
      CREATE VIEW locationRevisionContent AS SELECT * FROM locationRevision;
      CREATE VIEW locationCanonical AS SELECT id aliasId,id locationId FROM location;
      CREATE TABLE locationAddressHead(locationId TEXT,relationshipId TEXT,scopeOrganisationId TEXT,priority INTEGER,assertionState TEXT,addressState TEXT,effectiveFrom TEXT,effectiveTo TEXT,addressRevisionId TEXT);
      CREATE TABLE addressRevision(id TEXT,components TEXT);
      INSERT INTO addressRevision VALUES('linked-address','{"i18n":{"en":{"formattedAddress":"12 Station Road"}}}');
      INSERT INTO locationAddressHead VALUES('building:tower','addr',NULL,1,'asserted','current',NULL,NULL,'linked-address');
      CREATE TABLE locationRevisionI18n(revisionId TEXT,locale TEXT,name TEXT);
      CREATE TABLE organisationLocationHead(locationId TEXT,organisationId TEXT,overrides TEXT);
      INSERT INTO location VALUES ('lift','building_part','linked',NULL,NULL),('old','building_part','redirect',NULL,'lift'),
        ('floor','building_part','linked',NULL,NULL),('building:tower','building','linked',NULL,NULL),('mall','premises','linked',NULL,NULL),
        ('other','building','manual','other',NULL),('solo','building_part','manual','o',NULL);
      INSERT INTO fieldResearchSessionLocation VALUES ('a','old'),('a','solo'),('a','other');
      INSERT INTO locationMembershipHead VALUES ('old','floor',NULL,'1','asserted','current',NULL,NULL),('floor','building:tower',NULL,'2','asserted','current',NULL,NULL),
        ('building:tower','mall',NULL,'3','asserted','current',NULL,NULL),('old','other',NULL,'4','asserted','current',NULL,NULL),
        ('solo','building:tower',NULL,'5','asserted','current',NULL,NULL),('solo','building:tower','o','5','suppressed','current',NULL,NULL);
      INSERT INTO locationRevision SELECT id,id,1,'saanseoi','{}','{}' FROM location;
      UPDATE locationRevision SET rawSource='{"record":{"rawSource":{"properties":{"unit_category":"elevator"}}}}' WHERE id='lift';
      INSERT INTO locationRevisionI18n VALUES ('lift','en','Lift 1'),('building:tower','en','East Tower'),('mall','zh-hant','商場');
    `)
  return { sqlite, maintainer }
}

describe('Android shared field sessions', () => {
  it('renders saved and newly abbreviated titles as the same record tags', () => {
    const template =
      '{{session.code}}-{{ cases(properties.site, "east", "e", "north", "n") }}-{{000}}'
    for (const title of ['kc-017-East-004', 'kc-017-e-004'])
      expect(recorderIdentifierTags(title, 'kc-017', template)).toEqual(['E', '#004'])
    expect(
      recorderIdentifierTags('kc-017-007', 'kc-017', '{{session.code}}-{{000}}'),
    ).toEqual(['#007'])
    expect(recorderIdentifierTags('Freeform', 'kc-017', template)).toEqual([])
  })
  it('orders internal names by activity and applies project, organisation and hub scope', async () => {
    const { actor, maintainer } = fixture()
    expect((await listRecorderSessions(maintainer)).map(s => s.name)).toEqual([
      'Second',
      '內部名稱',
    ])
    for (const role of [
      { type: 'organisation', role: 'owner', organisationId: 'o' },
      { type: 'hub', role: 'admin', hubId: 'h', hub: { code: 'h' } },
    ])
      expect((await listRecorderSessions(actor(role))).map(s => s.id)).toEqual([
        'b',
        'a',
        'c',
      ])
    expect(
      await listRecorderSessions(
        actor({ type: 'project', role: 'translator', projectId: 'p' }),
      ),
    ).toEqual([])
    await expect(listRecorderRecords(maintainer, 'x')).rejects.toMatchObject({
      status: 403,
    })
    await expect(listRecorderLocations(maintainer, 'archived')).rejects.toMatchObject({
      status: 403,
    })
  })
  it('returns only assigned results with typed icons and current, unambiguous accessible ancestors', async () => {
    const { sqlite, maintainer } = locationFixture()
    const rows = await listRecorderLocations(maintainer, 'a')
    expect(rows.map(r => r.id).sort()).toEqual(['lift', 'solo'])
    expect(rows.find(r => r.id === 'lift')).toMatchObject({
      address: '12 Station Road',
      addressSortKey: 'Station Road 12',
      maps: [{ id: 'plan', unitId: 'unit-one', hash: 'published' }],
      building: {
        id: 'building:tower',
        name: 'East Tower',
        address: '12 Station Road',
        addressSortKey: 'Station Road 12',
        exteriorUrl: '/api/location-exterior/building%3Atower/asset/assembly.gltf',
        maps: [{ id: 'plan', unitId: null }],
      },
      premises: { id: 'mall', name: '商場' },
      iconPath: expect.any(String),
    })
    expect(rows.find(r => r.id === 'solo')).toMatchObject({
      building: null,
      premises: null,
      iconPath: null,
      maps: [],
    })
    sqlite.exec(`DELETE FROM locationRevisionI18n WHERE revisionId='building:tower';
      UPDATE locationRevision SET facts='{"location":{"address":{"fallbackDisplay":{"en":"2 Station Road"},"rawSource":{}}}}' WHERE id='building:tower';`)
    expect(
      (await listRecorderLocations(maintainer, 'a')).find(r => r.id === 'lift')
        ?.building,
    ).toMatchObject({
      id: 'building:tower',
      name: 'Unnamed Building',
      address: '2 Station Road',
      addressSortKey: 'Station Road 2',
    })
    sqlite.exec(
      "INSERT INTO location VALUES ('second','building','linked',NULL,NULL); INSERT INTO locationMembershipHead VALUES ('lift','second',NULL,'6','asserted','current',NULL,NULL);",
    )
    expect(
      (await listRecorderLocations(maintainer, 'a')).find(r => r.id === 'lift')
        ?.building,
    ).toBeNull()
  })
  it('verifies local coordinates against their saved surface and preserves legacy GPS', async () => {
    const { sqlite, maintainer } = locationFixture()
    const exterior = (
      pin: FacadePin | { realm: 'exterior'; point: [number, number] },
      locationId = 'building:tower',
    ) =>
      resolveRecorderPoint(maintainer, 'a', {
        spatialRealm: 'exterior',
        locationId,
        pin,
      })
    const facade: FacadePin = {
      realm: 'exterior',
      surface: 'facade',
      assetId: 'asset',
      geometryId: 'asset',
      facadeId: 'view-1',
      direction: 'North',
      percent: [15, 68],
      blend: 0,
      alignmentRevision: 0,
    }
    expect(await exterior(facade)).toBeNull()
    expect(await exterior({ realm: 'exterior', point: [114, 22] })).toEqual([114, 22])
    await expect(exterior({ ...facade, assetId: 'wrong' })).rejects.toMatchObject({
      status: 409,
    })
    sqlite.exec(readFileSync('migrations/0269_location_exterior_alignment.sql', 'utf8'))
    sqlite.exec(
      `INSERT INTO locationExteriorAlignment VALUES ('building:tower','asset','asset',1,'{"lines":[{"id":"ground"}]}','reader','2026')`,
    )
    expect(
      await exterior({ ...facade, alignmentRevision: 1, floorId: 'ground' }),
    ).toBeNull()
    await expect(
      exterior({ ...facade, alignmentRevision: 1, floorId: 'missing' }),
    ).rejects.toMatchObject({ status: 409 })

    // The selected building and a part inheriting its model use the same raw alignment owner.
    const placed = { ...facade, alignmentRevision: 1, floorId: 'ground' }
    expect(await exterior(placed, 'lift')).toBeNull()
    sqlite.exec(
      "INSERT INTO fieldResearchSessionLocation VALUES ('a','building:tower')",
    )
    expect(await exterior(placed)).toBeNull()

    const outer = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]
    const hole = [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
      [4, 4],
    ]
    const layer = (properties?: object, rings = [outer]) => ({
      type: 'FeatureCollection',
      features: properties
        ? [
            {
              type: 'Feature',
              properties,
              geometry: { type: 'Polygon', coordinates: rings },
            },
          ]
        : [],
    })
    const bundle = JSON.stringify({
      schemaVersion: 1,
      documents: [],
      data: {
        retrievedAt: '2026',
        coordinateSpace: 'image-pixels',
        connections: [],
        venue_polygon: layer({}),
        level_polygon: layer({ level_id: 'g' }),
        unit_polygon: layer({ level_id: 'g', unit_id: 'unit-one' }, [outer, hole]),
        opening_line: layer(),
        amenity_point: layer(),
        occupant_point: layer(),
      },
    })
    const hash = await mapHash(bundle)
    sqlite.prepare("UPDATE premisesMap SET publishedHash=? WHERE id='plan'").run(hash)
    // The building can inherit this session's published drawing from its assigned lift.
    sqlite.exec('DELETE FROM locationPremisesMap')
    const bucket = {
      get: async () => ({ text: async () => bundle }),
    } as unknown as NonNullable<Parameters<typeof resolveRecorderPoint>[3]>
    const pin: InteriorPin = {
      realm: 'interior',
      mapId: 'plan',
      hash,
      floorId: 'g',
      unitId: 'unit-one',
      point: [2, 7],
      percent: [20, 30],
    }
    const interior = (pin: InteriorPin, locationId = 'lift') =>
      resolveRecorderPoint(
        maintainer,
        'a',
        { spatialRealm: 'interior', locationId, pin },
        bucket,
      )
    expect(await interior(pin)).toBeNull()
    expect(await interior(pin, 'building:tower')).toBeNull()
    await expect(
      interior({ ...pin, point: [5, 5], percent: [50, 50] }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(interior({ ...pin, percent: [20, 70] })).rejects.toMatchObject({
      status: 400,
    })
    await expect(interior({ ...pin, hash: 'wrong' })).rejects.toMatchObject({
      status: 409,
    })
  })
})
