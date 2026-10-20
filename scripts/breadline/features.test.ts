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

/** Build minimal legacy source and destination schemas with actual Place/history migrations. */
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

test('imports participating donors/dropoffs as linked Places, with brands and phone arrays', () => {
  const { target, generate, apply, output } = fixture()
  try {
    generate()
    apply()
    expect(target.query('SELECT count(*) AS n FROM feature').get()).toEqual({ n: 2 })
    expect(target.query('SELECT count(*) AS n FROM featurePlace').get()).toEqual({
      n: 2,
    })
    expect(target.query('SELECT count(*) AS n FROM featurePlaceHistory').get()).toEqual(
      { n: 2 },
    )
    const donor = target
      .query(
        "SELECT r.facts,p.state,p.ownerProjectId,p.ssId FROM breadlineImportFeature i JOIN featurePlace f ON f.featureId=i.featureId JOIN place p ON p.id=f.placeId JOIN placeRevision r ON r.id=f.factsRevisionId WHERE i.sourceTable='donors'",
      )
      .get() as { facts: string; state: string; ownerProjectId: string; ssId: null }
    expect(donor.state).toBe('unresolved')
    expect(donor.ownerProjectId).toBe('p')
    expect(donor.ssId).toBeNull()
    const facts = JSON.parse(donor.facts)
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
    expect(target.query('SELECT count(*) AS n FROM featurePlaceHistory').get()).toEqual(
      { n: 2 },
    )
  } finally {
    target.close()
  }
})

test('rolls back the generated import if association history fails', () => {
  const { target, generate, apply } = fixture()
  try {
    generate()
    target.exec(
      "CREATE TRIGGER fail_import BEFORE INSERT ON featurePlaceHistory BEGIN SELECT RAISE(ABORT,'injected'); END",
    )
    expect(apply).toThrow('injected')
    for (const table of [
      'feature',
      'place',
      'placeRevision',
      'featurePlace',
      'breadlineImportFeature',
    ])
      expect(target.query(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 })
  } finally {
    target.close()
  }
})

test('quarantines malformed eligible rows and removes a stale executable plan', () => {
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
    expect(receipt.diagnostics.map((row: { code: string }) => row.code).sort()).toEqual(
      [
        'INVALID_ACTIVITY_FLAG',
        'INVALID_COORDINATE_NUMBER',
        'INVALID_SOURCE_TIMESTAMP',
        'MISSING_ENGLISH_NAME',
      ],
    )
    expect(() => readFileSync(output)).toThrow()
    expect(target.query('SELECT count(*) AS n FROM feature').get()).toEqual({ n: 0 })
  } finally {
    target.close()
  }
})

test('excluded donors do not block planning and receipt separates skipped rows', () => {
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
})

test('changed accepted source identity remains blocked without changing imported IDs', () => {
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
})

test('requires the universal phone property rather than a same-named scoped property', () => {
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
})
