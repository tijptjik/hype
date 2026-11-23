// BUN
import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
// NODE
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
// PIPELINE
import {
  compareFeatureSources,
  reconcileFeatureFields,
  type FeatureSource,
} from './lib/feature-sync'
import {
  planFeatureSync,
  applyFeatureSyncGroup,
  type FeatureSyncState,
} from './lib/feature-sync-plan'
import { userSyncHash } from './lib/user-sync-contract'
import { openSqliteDomain } from '../locations/lib/sqlite-domain'

const cleanup: Array<() => void> = []
afterEach(() => {
  for (const f of cleanup.splice(0)) f()
})
const source: FeatureSource = {
  snapshotAt: '2026-11-13',
  rows: [
    {
      table: 'donors',
      id: '1',
      hash: 'a',
      eligible: true,
      source: { id: 1, name_en: 'Bakery' },
    },
  ],
}

/** Create a minimal deployed-schema projection with real foreign keys.
 * @param populated Whether to populate one transformed donor.
 * @returns Disposable SQLite connection and D1 adapter.
 */
function fixture(populated: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'feature-sync-'))
  const domain = openSqliteDomain(createFile(join(dir, 'db.sqlite')))
  cleanup.push(() => {
    domain.close()
    rmSync(dir, { recursive: true, force: true })
  })
  domain.sqlite.exec(`CREATE TABLE feature(id TEXT PRIMARY KEY, geometry TEXT, isPublished INTEGER,mtrStation TEXT,districtId TEXT,mtrExit TEXT,mtrDistance INTEGER,mtrResolution TEXT);
    CREATE TABLE featureMtrJob(featureId TEXT,geometry TEXT);
    CREATE TABLE featureI18n(featureId TEXT REFERENCES feature(id),locale TEXT,title TEXT,PRIMARY KEY(featureId,locale));
    CREATE TABLE featureProperty(featureId TEXT REFERENCES feature(id),propertyId TEXT,value TEXT,PRIMARY KEY(featureId,propertyId));
    CREATE TABLE place(id TEXT PRIMARY KEY,state TEXT);
    CREATE TABLE placeRevision(id TEXT PRIMARY KEY,placeId TEXT REFERENCES place(id),sequence INTEGER,facts TEXT,UNIQUE(placeId,sequence));
    CREATE TABLE featurePlace(featureId TEXT PRIMARY KEY REFERENCES feature(id),placeId TEXT REFERENCES place(id),factsRevisionId TEXT REFERENCES placeRevision(id),locationRevisionId TEXT REFERENCES placeRevision(id),overrides TEXT);
    CREATE TABLE breadlineImportFeature(sourceTable TEXT,sourceId TEXT,featureId TEXT UNIQUE REFERENCES feature(id),sourceHash TEXT,PRIMARY KEY(sourceTable,sourceId));`)
  if (populated)
    domain.sqlite.exec(`INSERT INTO feature(id,geometry,isPublished) VALUES('f','point',1);
    INSERT INTO featureI18n VALUES('f','en','Bakery');
    INSERT INTO featureProperty VALUES('f','phone','[]');
    INSERT INTO place VALUES('p','unresolved');
    INSERT INTO placeRevision VALUES('r','p',1,'{}');
    INSERT INTO featurePlace VALUES('f','p','r','r','{}');
    INSERT INTO breadlineImportFeature VALUES('donors','1','f','a');`)
  return domain
}
/** Create an empty SQLite file for the existing-file adapter. @param path Temporary path. @returns Path. */
function createFile(path: string): string {
  new Database(path).close()
  return path
}

test('detects definitions, new identities, missing rows and run eligibility independently', () => {
  expect(compareFeatureSources(source, source)).toEqual([])
  const changed = structuredClone(source)
  changed.rows[0].source.name_en = 'New name'
  changed.rows[0].hash = 'b'
  expect(compareFeatureSources(source, changed)[0].fields).toEqual(['name_en'])
  changed.rows[0] = { ...source.rows[0], eligible: false }
  expect(compareFeatureSources(source, changed)[0].kind).toBe('eligibility')
  expect(compareFeatureSources(source, { ...source, rows: [] })[0].kind).toBe('missing')
  expect(() =>
    compareFeatureSources(source, { ...source, snapshotAt: '2026-01-01' }),
  ).toThrow()
})

test('three-way reconciliation preserves local edits and identifies conflicting upstream edits', () => {
  expect(
    reconcileFeatureFields(
      { title: 'Old', phone: '1' },
      { title: 'Old', phone: '2' },
      { title: 'Local', phone: '1' },
    ),
  ).toEqual({ merged: { title: 'Local', phone: '2' }, conflicts: [] })
  expect(
    reconcileFeatureFields({ title: 'Old' }, { title: 'New' }, { title: 'Local' })
      .conflicts,
  ).toEqual(['title'])
})

test('initial import is atomic, retryable and unchanged export plans zero writes', async () => {
  const target = fixture(false),
    desired = fixture(true)
  const plan = planFeatureSync(
    source,
    desired.sqlite,
    target.sqlite,
    null,
    'production:test',
  )
  expect(plan.exceptions).toEqual([])
  expect(plan.counts.created).toBe(1)
  await applyFeatureSyncGroup(target.binding, plan.groups[0])
  await applyFeatureSyncGroup(target.binding, plan.groups[0])
  expect(target.sqlite.query('SELECT count(*) n FROM feature').get()).toEqual({ n: 1 })
  const state: FeatureSyncState = {
    version: 1,
    targetIdentity: plan.targetIdentity,
    source,
    projections: plan.projections,
    planHash: userSyncHash(plan),
  }
  expect(
    planFeatureSync(source, desired.sqlite, target.sqlite, state, state.targetIdentity)
      .groups,
  ).toEqual([])
})

test('a late collision rolls back the entire Feature group', async () => {
  const target = fixture(false),
    desired = fixture(true)
  const plan = planFeatureSync(
    source,
    desired.sqlite,
    target.sqlite,
    null,
    'production:test',
  )
  target.sqlite.run("INSERT INTO place VALUES('p','manual')")
  await expect(applyFeatureSyncGroup(target.binding, plan.groups[0])).rejects.toThrow()
  expect(target.sqlite.query('SELECT * FROM feature').all()).toEqual([])
})

test('source rename adds immutable evidence and retains a downstream publication choice', async () => {
  const target = fixture(false),
    desired = fixture(true)
  const first = planFeatureSync(
    source,
    desired.sqlite,
    target.sqlite,
    null,
    'production:test',
  )
  await applyFeatureSyncGroup(target.binding, first.groups[0])
  const state: FeatureSyncState = {
    version: 1,
    targetIdentity: first.targetIdentity,
    source,
    projections: first.projections,
    planHash: userSyncHash(first),
  }
  target.sqlite.run('UPDATE feature SET isPublished=0')
  desired.sqlite.run("UPDATE featureI18n SET title='Renamed'")
  desired.sqlite.run("UPDATE breadlineImportFeature SET sourceHash='b'")
  const nextSource = structuredClone(source)
  nextSource.rows[0].hash = 'b'
  nextSource.rows[0].source.name_en = 'Renamed'
  const next = planFeatureSync(
    nextSource,
    desired.sqlite,
    target.sqlite,
    state,
    state.targetIdentity,
  )
  expect(next.exceptions).toEqual([])
  await applyFeatureSyncGroup(target.binding, next.groups[0])
  expect(target.sqlite.query('SELECT title FROM featureI18n').get()).toEqual({
    title: 'Renamed',
  })
  expect(target.sqlite.query('SELECT isPublished FROM feature').get()).toEqual({
    isPublished: 0,
  })
  expect(target.sqlite.query('SELECT count(*) n FROM placeRevision').get()).toEqual({
    n: 2,
  })
})

test('conflicting names and absent source records block acceptance rather than overwrite or delete', async () => {
  const target = fixture(false),
    desired = fixture(true)
  const first = planFeatureSync(
    source,
    desired.sqlite,
    target.sqlite,
    null,
    'production:test',
  )
  await applyFeatureSyncGroup(target.binding, first.groups[0])
  const state: FeatureSyncState = {
    version: 1,
    targetIdentity: first.targetIdentity,
    source,
    projections: first.projections,
    planHash: userSyncHash(first),
  }
  target.sqlite.run("UPDATE featureI18n SET title='Curated'")
  desired.sqlite.run("UPDATE featureI18n SET title='Upstream'")
  const next = structuredClone(source)
  next.rows[0].source.name_en = 'Upstream'
  next.rows[0].hash = 'b'
  expect(
    planFeatureSync(next, desired.sqlite, target.sqlite, state, state.targetIdentity)
      .exceptions,
  ).toContainEqual({
    identity: 'donors:1',
    reason: 'concurrent_edit:featureI18n',
    fields: ['title'],
  })
  expect(
    planFeatureSync(
      { ...source, rows: [] },
      desired.sqlite,
      target.sqlite,
      state,
      state.targetIdentity,
    ).exceptions[0].reason,
  ).toBe('source_missing_no_automatic_deletion')
})

test('geometry changes invalidate derived projections and remain retryable', async () => {
  const target = fixture(false),
    desired = fixture(true)
  const first = planFeatureSync(
    source,
    desired.sqlite,
    target.sqlite,
    null,
    'production:test',
  )
  await applyFeatureSyncGroup(target.binding, first.groups[0])
  const state: FeatureSyncState = {
    version: 1,
    targetIdentity: first.targetIdentity,
    source,
    projections: first.projections,
    planHash: userSyncHash(first),
  }
  target.sqlite.run("UPDATE feature SET mtrStation='calculated-old-station'")
  target.sqlite.run(
    'CREATE TRIGGER moved AFTER UPDATE OF geometry ON feature WHEN NEW.geometry IS NOT OLD.geometry BEGIN UPDATE feature SET mtrStation=NULL WHERE id=NEW.id; END',
  )
  desired.sqlite.run("UPDATE feature SET geometry='new-point'")
  const nextSource = structuredClone(source)
  nextSource.rows[0].hash = 'moved'
  nextSource.rows[0].source.longitude = 114.2
  const plan = planFeatureSync(
    nextSource,
    desired.sqlite,
    target.sqlite,
    state,
    state.targetIdentity,
  )
  expect(plan.exceptions).toEqual([])
  await applyFeatureSyncGroup(target.binding, plan.groups[0])
  await applyFeatureSyncGroup(target.binding, plan.groups[0])
  expect(target.sqlite.query('SELECT geometry,mtrStation FROM feature').get()).toEqual({
    geometry: 'new-point',
    mtrStation: null,
  })
})

test('a lost-response retry preserves automatic production enrichment', async () => {
  const target = fixture(false),
    desired = fixture(true)
  const plan = planFeatureSync(
    source,
    desired.sqlite,
    target.sqlite,
    null,
    'production:test',
  )
  await applyFeatureSyncGroup(target.binding, plan.groups[0])
  target.sqlite.run(
    "UPDATE feature SET districtId='derived-district',mtrStation='derived-station'",
  )
  const before = target.sqlite.query('SELECT total_changes() n').get()
  await applyFeatureSyncGroup(target.binding, plan.groups[0])
  expect(target.sqlite.query('SELECT total_changes() n').get()).toEqual(before)
  expect(
    target.sqlite.query('SELECT districtId,mtrStation FROM feature').get(),
  ).toEqual({ districtId: 'derived-district', mtrStation: 'derived-station' })
})

test('a newly reviewed point retains its accepted MTR access after geometry triggers', async () => {
  const target = fixture(false),
    desired = fixture(true)
  const first = planFeatureSync(
    source,
    desired.sqlite,
    target.sqlite,
    null,
    'production:test',
  )
  await applyFeatureSyncGroup(target.binding, first.groups[0])
  const state: FeatureSyncState = {
    version: 1,
    targetIdentity: first.targetIdentity,
    source,
    projections: first.projections,
    planHash: userSyncHash(first),
  }
  target.sqlite.run(
    'CREATE TRIGGER moved AFTER UPDATE OF geometry ON feature WHEN NEW.geometry IS NOT OLD.geometry BEGIN UPDATE feature SET mtrStation=NULL,mtrExit=NULL,mtrDistance=NULL,mtrResolution=NULL WHERE id=NEW.id; INSERT INTO featureMtrJob VALUES(NEW.id,NEW.geometry); END',
  )
  desired.sqlite.run(
    `UPDATE feature SET geometry='reviewed-point',mtrStation='accepted-station',mtrExit='exit',mtrDistance=100,mtrResolution='{"review":{"policy":"breadline-donor-v1"}}'`,
  )
  const nextSource = structuredClone(source)
  nextSource.rows[0].hash = 'reviewed-move'
  const plan = planFeatureSync(
    nextSource,
    desired.sqlite,
    target.sqlite,
    state,
    state.targetIdentity,
  )
  expect(plan.exceptions).toEqual([])
  await applyFeatureSyncGroup(target.binding, plan.groups[0])
  const before = target.sqlite.query('SELECT total_changes() n').get()
  await applyFeatureSyncGroup(target.binding, plan.groups[0])
  expect(target.sqlite.query('SELECT total_changes() n').get()).toEqual(before)
  expect(target.sqlite.query('SELECT mtrStation FROM feature').get()).toEqual({
    mtrStation: 'accepted-station',
  })
  expect(target.sqlite.query('SELECT * FROM featureMtrJob').all()).toEqual([])
})
