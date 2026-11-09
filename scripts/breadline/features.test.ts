import {
  readLocationFacts,
  LocationFactsSnapshotSchema,
} from '../../src/lib/locations/factsSnapshot'
import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { planBreadlineFeatures } from './features'

const directories: string[] = []
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true })
})

/** Build minimal legacy source and destination schemas with actual Location/history migrations. */
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'breadline-place-import-'))
  directories.push(directory)
  const sourcePath = join(directory, 'source.sqlite')
  const targetPath = join(directory, 'target.sqlite')
  const output = join(directory, 'migration.sql')
  const source = new Database(sourcePath)
  source.exec(`CREATE TABLE breadline__public__donors(id INTEGER, name_en TEXT, name_zh TEXT,
    address_full_en TEXT,address_full_zh TEXT,longitude REAL,latitude REAL,active INTEGER,
    brand TEXT,phone TEXT,created_at TEXT,last_updated_at TEXT,_breadline_row_hash TEXT);
    INSERT INTO breadline__public__donors VALUES (900001,'Shop','店舖','Address','地址',114.1,22.3,1,'kayser','2345 6789','2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z','hash-1'),
      (900002,'No runs','未使用','Address','地址',114.1,22.3,1,'kayser','2345 6789','2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z','hash-2');
    CREATE TABLE breadline__public__runs(donor_id INTEGER);
    INSERT INTO breadline__public__runs VALUES (900001);
    CREATE TABLE breadline__public__dropoffs(id INTEGER,name_en TEXT,name_zh TEXT,address_full_en TEXT,
      address_full_zh TEXT,longitude REAL,latitude REAL,created_at TEXT,last_updated_at TEXT,_breadline_row_hash TEXT);
    INSERT INTO breadline__public__dropoffs VALUES (900003,'Dropoff','收集點','Address','地址',114.1,22.3,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z','hash-3');`)
  source.close()
  const target = new Database(targetPath)
  target.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE organisation(id TEXT PRIMARY KEY,code TEXT);
    INSERT INTO organisation VALUES ('org','hkfoodworks');
    CREATE TABLE project(id TEXT PRIMARY KEY,organisationId TEXT,code TEXT);
    INSERT INTO project VALUES ('p','org','breadline');
    CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT); INSERT INTO user VALUES ('u','Claudio');
    CREATE TABLE projectRole(projectId TEXT,userId TEXT,role TEXT); INSERT INTO projectRole VALUES ('p','u','maintainer');
    CREATE TABLE layer(id TEXT PRIMARY KEY,projectId TEXT); INSERT INTO layer VALUES ('1msQMcuqfHrP','p'),('kin0shUTfrUi','p');
    CREATE TABLE hub(id TEXT PRIMARY KEY,code TEXT); INSERT INTO hub VALUES('core','core');
    CREATE TABLE property(id TEXT PRIMARY KEY,hubId TEXT,key TEXT,scope TEXT,component TEXT);
    INSERT INTO property VALUES('gPropPhNum01','core','phoneNumber','hub','PhoneField');
    CREATE TABLE propertyValueI18n(propertyValueId TEXT,locale TEXT,value TEXT);
    CREATE TABLE feature(id TEXT PRIMARY KEY,projectId TEXT,organisationId TEXT,layerId TEXT,contributorId TEXT,
      geometry TEXT,spatialIndex TEXT,addressMeta TEXT,isPublished INTEGER,publisherId TEXT,publishedAt TEXT,
      isArchived INTEGER,isPendingReview INTEGER,isDraft INTEGER,isIntangible INTEGER,isVisitable INTEGER,
      createdAt TEXT,modifiedAt TEXT);
    CREATE TABLE featureI18n(featureId TEXT,locale TEXT,title TEXT,titleGen INTEGER,description TEXT,
      descriptionGen INTEGER,displayAddress TEXT,displayAddressGen INTEGER,addressProperties TEXT);
    CREATE TABLE featureProperty(featureId TEXT,propertyId TEXT,propertyValueId TEXT,value TEXT);`)
  for (const migration of [
    '0097_breadline_feature_identity.sql',
    '0102_place_inheritance_foundation.sql',
    '0110_feature_place_history.sql',
    '0112_feature_place_detachment.sql',
    '0113_place_adoption_review.sql',
    '0116_place_identity_history.sql',
    '0117_place_identity_review.sql',
    '0118_place_merge_redirect.sql',
    '0120_place_identity_rejection.sql',
    '0123_place_owned_fields.sql',
    '0124_place_adoption_decisions.sql',
    '0125_place_identity_consolidation.sql',
    '0135_place_organisation_ownership.sql',
    '0137_location_kinds.sql',
    '0114_place_refresh.sql',
    '0115_place_refresh_processing.sql',
    '0119_place_source_changes.sql',
    '0121_place_refresh_identity_scan.sql',
    '0122_simplify_place_refresh.sql',
    '0138_location_storage.sql',
    '0139_organisation_location_corrections.sql',
    '0142_location_facts_snapshots.sql',
    '0154_location_version_names.sql',
  ])
    target.exec(readFileSync(`migrations/${migration}`, 'utf8'))
  const generate = () =>
    planBreadlineFeatures([
      '--source',
      sourcePath,
      '--target',
      targetPath,
      '--output',
      output,
    ])
  // Bun multi-statement exec can skip an intermediate error; use sqlite3's fail-fast runner.
  const apply = () => {
    const result = spawnSync(
      'python3',
      [
        '-c',
        "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('PRAGMA foreign_keys=ON'); c.executescript('BEGIN IMMEDIATE;\\n'+open(sys.argv[2]).read()+'\\nCOMMIT;'); c.close()",
        targetPath,
        output,
      ],
      { encoding: 'utf8' },
    )
    if (result.status !== 0) throw new Error(result.stderr)
  }
  return { target, generate, apply, output, sourcePath }
}

// These cases apply real migrations and invoke Python to verify atomic rollback.
const MIGRATED_IMPORT_TIMEOUT_MS = 20_000

test(
  'imports participating donors/dropoffs as linked Locations, with brands and phone arrays',
  () => {
    const { target, generate, apply, output } = fixture()
    try {
      generate()
      const firstLocations = readFileSync(output, 'utf8')
        .split('\n')
        .filter(line => line.startsWith('INSERT INTO location '))
      generate()
      expect(
        readFileSync(output, 'utf8')
          .split('\n')
          .filter(line => line.startsWith('INSERT INTO location ')),
      ).toEqual(firstLocations)
      apply()
      expect(target.query('SELECT count(*) AS n FROM feature').get()).toEqual({ n: 2 })
      expect(target.query('SELECT count(*) AS n FROM featureLocation').get()).toEqual({
        n: 2,
      })
      expect(
        target.query('SELECT count(*) AS n FROM featureLocationHistory').get(),
      ).toEqual({ n: 2 })
      const locationIds = target.query('SELECT id FROM location ORDER BY id').all() as {
        id: string
      }[]
      for (const row of locationIds) expect(row.id).toMatch(/^[A-Za-z0-9_-]{12}$/)
      for (const row of target.query('SELECT id FROM locationRevision').all() as {
        id: string
      }[])
        expect(row.id).toMatch(/^[A-Za-z0-9_-]{12}$/)
      const donor = target
        .query(
          "SELECT r.facts,p.kind,p.state,p.ownerOrganisationId,p.ssId FROM breadlineImportFeature i JOIN featureLocation f ON f.featureId=i.featureId JOIN location p ON p.id=f.locationId JOIN locationRevision r ON r.id=f.factsRevisionId WHERE i.sourceTable='donors'",
        )
        .get() as {
        facts: string
        kind: string
        state: string
        ownerOrganisationId: string
        ssId: null
      }
      expect(donor.state).toBe('unresolved')
      expect(donor.kind).toBe('establishment')
      expect(
        target.query("SELECT count(*) AS n FROM location WHERE kind='unknown'").get(),
      ).toEqual({ n: 1 })
      expect(donor.ownerOrganisationId).toBe('org')
      expect(donor.ssId).toBeNull()
      const snapshot = LocationFactsSnapshotSchema.parse(JSON.parse(donor.facts))
      expect(snapshot.kind).toBe('establishment')
      const facts = readLocationFacts(donor.facts)
      expect(facts.phoneNumber).toEqual(['+85223456789'])
      expect(facts.brands[0].names.en).toBe('Maison Kayser')
      expect(facts.location.address.status).toBe('unresolved')
      expect(
        target.query("SELECT value FROM featureProperty WHERE value != '[]'").get(),
      ).toEqual({ value: '["+85223456789"]' })
      expect(
        target
          .query(
            "SELECT count(*) AS n FROM featureProperty WHERE propertyId='WhWlW8KcN2wq'",
          )
          .get(),
      ).toEqual({ n: 0 })
      const receipt = JSON.parse(readFileSync(output + '.receipt.json', 'utf8'))
      expect(receipt.excludedDonors).toEqual([
        { sourceId: '900002', reason: 'no_recorded_runs', alreadyImported: false },
      ])
      generate()
      apply()
      expect(
        target.query('SELECT count(*) AS n FROM featureLocationHistory').get(),
      ).toEqual({ n: 2 })
    } finally {
      target.close()
    }
  },
  MIGRATED_IMPORT_TIMEOUT_MS,
)

test(
  'rolls back the generated import if association history fails',
  () => {
    const { target, generate, apply } = fixture()
    try {
      generate()
      target.exec(
        "CREATE TRIGGER fail_import BEFORE INSERT ON featureLocationHistory BEGIN SELECT RAISE(ABORT,'injected'); END",
      )
      expect(apply).toThrow('injected')
      for (const table of [
        'feature',
        'location',
        'locationRevision',
        'featureLocation',
        'breadlineImportFeature',
      ])
        expect(target.query(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({
          n: 0,
        })
    } finally {
      target.close()
    }
  },
  MIGRATED_IMPORT_TIMEOUT_MS,
)

test(
  'quarantines malformed eligible rows and removes a stale executable plan',
  () => {
    const { target, generate, output, sourcePath } = fixture()
    try {
      generate()
      const source = new Database(sourcePath)
      source.exec(
        "UPDATE breadline__public__donors SET active=2,created_at='2025-02-30T00:00:00.000Z',name_en=NULL WHERE id=900001",
      )
      source.exec('UPDATE breadline__public__dropoffs SET latitude=NULL')
      source.close()
      expect(generate).toThrow('2 quarantined row(s)')
      const receipt = JSON.parse(readFileSync(output + '.receipt.json', 'utf8'))
      expect(receipt).toMatchObject({
        status: 'blocked',
        quarantined: 2,
        skipped: 1,
        created: 0,
      })
      expect(
        receipt.diagnostics.map((row: { code: string }) => row.code).sort(),
      ).toEqual([
        'INVALID_ACTIVITY_FLAG',
        'INVALID_COORDINATE_NUMBER',
        'INVALID_SOURCE_TIMESTAMP',
        'MISSING_ENGLISH_NAME',
      ])
      expect(() => readFileSync(output)).toThrow()
      expect(target.query('SELECT count(*) AS n FROM feature').get()).toEqual({ n: 0 })
    } finally {
      target.close()
    }
  },
  MIGRATED_IMPORT_TIMEOUT_MS,
)

test(
  'excluded donors do not block planning and receipt separates skipped rows',
  () => {
    const { target, generate, output, sourcePath } = fixture()
    try {
      const source = new Database(sourcePath)
      source.exec(
        "UPDATE breadline__public__donors SET active=9,latitude=NULL,created_at='invalid' WHERE id=900002",
      )
      source.close()
      generate()
      expect(JSON.parse(readFileSync(output + '.receipt.json', 'utf8'))).toMatchObject({
        status: 'ready',
        created: 2,
        skipped: 1,
        quarantined: 0,
      })
    } finally {
      target.close()
    }
  },
  MIGRATED_IMPORT_TIMEOUT_MS,
)

test(
  'changed accepted source identity remains blocked without changing imported IDs',
  () => {
    const { target, generate, apply, sourcePath, output } = fixture()
    try {
      generate()
      apply()
      const before = target
        .query('SELECT * FROM breadlineImportFeature ORDER BY sourceTable,sourceId')
        .all()
      const source = new Database(sourcePath)
      source.exec(
        "UPDATE breadline__public__donors SET _breadline_row_hash='changed' WHERE id=900001",
      )
      source.close()
      expect(generate).toThrow('Source changed for donors:900001')
      expect(() => readFileSync(output)).toThrow()
      expect(
        target
          .query('SELECT * FROM breadlineImportFeature ORDER BY sourceTable,sourceId')
          .all(),
      ).toEqual(before)
    } finally {
      target.close()
    }
  },
  MIGRATED_IMPORT_TIMEOUT_MS,
)

test(
  'requires the universal phone property rather than a same-named scoped property',
  () => {
    const { target, generate, output } = fixture()
    try {
      generate()
      target.exec("UPDATE property SET scope='organisation'")
      expect(generate).toThrow(
        'Universal phone property gPropPhNum01 is missing or incompatible',
      )
      expect(() => readFileSync(output)).toThrow()
      expect(target.query('SELECT count(*) AS n FROM feature').get()).toEqual({ n: 0 })
    } finally {
      target.close()
    }
  },
  MIGRATED_IMPORT_TIMEOUT_MS,
)

test(
  'refuses legacy import planning after Feature revision cutover',
  () => {
    const f = fixture()
    try {
      f.target.exec(
        'CREATE TABLE featureRevisionCreationPolicy(singleton INTEGER PRIMARY KEY,enabled INTEGER); INSERT INTO featureRevisionCreationPolicy VALUES(1,1)',
      )
      expect(() => f.generate()).toThrow('attributed import writer')
      f.target.exec(
        "UPDATE featureRevisionCreationPolicy SET enabled=0; CREATE TABLE featureRevisionHead(featureId TEXT); INSERT INTO featureRevisionHead VALUES('enrolled')",
      )
      f.target.exec("INSERT INTO feature(id,projectId) VALUES('enrolled','p')")
      expect(() => f.generate()).toThrow('revision-backed Features')
    } finally {
      f.target.close()
    }
  },
  MIGRATED_IMPORT_TIMEOUT_MS,
)
