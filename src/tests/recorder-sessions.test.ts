// @vitest-environment node
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  listRecorderLocations,
  listRecorderRecords,
  listRecorderSessions,
} from '#lib/db/services/recorderSessions.js'
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
  const actor = (role: object) => ({
    db: store.db as unknown as Database,
    user: { id: 'reader' },
    userRoles: [role] as UserRoleDisco[],
  })
  const maintainer = actor({ type: 'project', role: 'maintainer', projectId: 'p' })
  return { sqlite, actor, maintainer }
}

describe('Android shared field sessions', () => {
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
    const { sqlite, maintainer } = fixture()
    sqlite.exec(`CREATE TABLE location(id TEXT PRIMARY KEY,matchingType TEXT,state TEXT,ownerOrganisationId TEXT,redirectTargetId TEXT);
      CREATE TABLE fieldResearchSessionLocation(sessionId TEXT,locationId TEXT);
      CREATE TABLE premisesMap(id TEXT,name TEXT,publishedHash TEXT);
      CREATE TABLE premisesMapUnit(locationId TEXT,mapId TEXT,unitId TEXT);
      CREATE TABLE locationPremisesMap(locationId TEXT,mapId TEXT);
      INSERT INTO premisesMap VALUES('plan','Tower','published'),('draft','Draft',NULL);
      INSERT INTO premisesMapUnit VALUES('lift','plan','unit-one'),('solo','draft','draft-unit');
      INSERT INTO locationPremisesMap VALUES('tower','plan');
      CREATE TABLE locationMembershipHead(childLocationId TEXT,parentLocationId TEXT,scopeOrganisationId TEXT,relationshipId TEXT,assertionState TEXT,membershipState TEXT,effectiveFrom TEXT,effectiveTo TEXT);
      CREATE TABLE locationRevision(id TEXT,locationId TEXT,version INTEGER,origin TEXT,facts TEXT,rawSource TEXT);
      CREATE TABLE locationRevisionI18n(revisionId TEXT,locale TEXT,name TEXT);
      CREATE TABLE organisationLocationHead(locationId TEXT,organisationId TEXT,overrides TEXT);
      INSERT INTO location VALUES ('lift','building_part','linked',NULL,NULL),('old','building_part','redirect',NULL,'lift'),
        ('floor','building_part','linked',NULL,NULL),('tower','building','linked',NULL,NULL),('mall','premises','linked',NULL,NULL),
        ('other','building','manual','other',NULL),('solo','building_part','manual','o',NULL);
      INSERT INTO fieldResearchSessionLocation VALUES ('a','old'),('a','solo'),('a','other');
      INSERT INTO locationMembershipHead VALUES ('old','floor',NULL,'1','asserted','current',NULL,NULL),('floor','tower',NULL,'2','asserted','current',NULL,NULL),
        ('tower','mall',NULL,'3','asserted','current',NULL,NULL),('old','other',NULL,'4','asserted','current',NULL,NULL),
        ('solo','tower',NULL,'5','asserted','current',NULL,NULL),('solo','tower','o','5','suppressed','current',NULL,NULL);
      INSERT INTO locationRevision SELECT id,id,1,'saanseoi','{}','{}' FROM location;
      UPDATE locationRevision SET rawSource='{"record":{"rawSource":{"properties":{"unit_category":"elevator"}}}}' WHERE id='lift';
      INSERT INTO locationRevisionI18n VALUES ('lift','en','Lift 1'),('tower','en','East Tower'),('mall','zh-hant','商場');
    `)
    const rows = await listRecorderLocations(maintainer, 'a')
    expect(rows.map(r => r.id).sort()).toEqual(['lift', 'solo'])
    expect(rows.find(r => r.id === 'lift')).toMatchObject({
      maps: [{ id: 'plan', unitId: 'unit-one', hash: 'published' }],
      building: {
        id: 'tower',
        name: 'East Tower',
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
    sqlite.exec(
      "INSERT INTO location VALUES ('second','building','linked',NULL,NULL); INSERT INTO locationMembershipHead VALUES ('lift','second',NULL,'6','asserted','current',NULL,NULL);",
    )
    expect(
      (await listRecorderLocations(maintainer, 'a')).find(r => r.id === 'lift')
        ?.building,
    ).toBeNull()
  })
})
