import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { featureRevisionContentFixture } from '../../../src/tests/fixtures/featureRevisionContent'
import { prepareLegacyDraftConversion } from './convert-drafts'
import { openSqliteDomain } from '../../locations/lib/sqlite-domain'
import { prepareRelease } from '../../revisions/production/prepare'
import {
  applyGroups,
  markVerified,
  pause,
  digest,
  fingerprint,
  schemaFingerprint,
  type Plan,
} from '../../revisions/production/contract'
const paths: string[] = []
afterEach(() => {
  for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true })
})

/** Build a private legacy draft already represented in the target schema. @returns Replayable database and managed plan. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'draft-conversion-'))
  paths.push(root)
  const path = join(root, 'db.sqlite')
  const sqlite = new Database(path)
  sqlite.exec(`CREATE TABLE feature(id TEXT PRIMARY KEY,currentRevisionId TEXT,revisionVersion INTEGER,isDraft INTEGER,isPublished INTEGER,isArchived INTEGER,contributorId TEXT,organisationId TEXT,projectId TEXT,layerId TEXT);
    CREATE TABLE featureRevision(id TEXT PRIMARY KEY,featureId TEXT REFERENCES feature(id),content TEXT,recordState TEXT,sequence INTEGER);
    CREATE TABLE featureRevisionProposal(id TEXT PRIMARY KEY,featureId TEXT REFERENCES feature(id),baseRevisionId TEXT REFERENCES featureRevision(id),kind TEXT,status TEXT,version TEXT,contributorId TEXT,changes TEXT,creationScope TEXT);
    CREATE TABLE featureRevisionReview(id TEXT PRIMARY KEY,featureId TEXT REFERENCES feature(id));
    CREATE TABLE featureUploadEvidence(id TEXT PRIMARY KEY,featureId TEXT REFERENCES feature(id),proposalId TEXT,proposalVersion TEXT);
    CREATE TABLE featureRevisionImage(featureRevisionId TEXT REFERENCES featureRevision(id),imageId TEXT);
    CREATE TABLE task(id TEXT PRIMARY KEY,featureId TEXT REFERENCES feature(id),proposalId TEXT,type TEXT,isDraft INTEGER,isReviewed INTEGER,contributorId TEXT,modifiedAt TEXT);
    CREATE TABLE taskImage(taskId TEXT,imageId TEXT);
    CREATE TABLE revisionChangeSet(id TEXT PRIMARY KEY,actorId TEXT,origin TEXT,reason TEXT,createdAt TEXT,legacyEvidence TEXT);
    CREATE TRIGGER feature_revision_no_delete BEFORE DELETE ON featureRevision BEGIN SELECT RAISE(ABORT,'immutable'); END;
    INSERT INTO feature VALUES('f','r',0,1,0,0,'author','org','project','layer');
    INSERT INTO task VALUES('task','f','proposal','newFeature',1,0,'author','clock');`)
  const content = featureRevisionContentFixture()
  content.gallery = { entries: {}, order: [] }
  sqlite
    .query('INSERT INTO featureRevision VALUES(?,?,?,?,?)')
    .run('r', 'f', JSON.stringify(content), '{}', 0)
  sqlite
    .query('INSERT INTO featureRevisionProposal VALUES(?,?,?,?,?,?,?,?,?)')
    .run(
      'proposal',
      'f',
      'r',
      'update',
      'draft',
      'v',
      'author',
      JSON.stringify({ format: 'feature-changes/v1', operations: [] }),
      JSON.stringify({ legacyInitial: { mode: 'contribution' } }),
    )
  const groups = prepareLegacyDraftConversion(sqlite)
  const tables = [
    'feature',
    'featureRevision',
    'featureRevisionProposal',
    'featureRevisionReview',
    'featureUploadEvidence',
    'featureRevisionImage',
    'task',
    'taskImage',
    'revisionChangeSet',
  ]
  const schema = schemaFingerprint(
    sqlite
      .query('SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL')
      .all() as never[],
  )
  const initial = Object.fromEntries(
    tables.map(table => [
      table,
      fingerprint(sqlite.query(`SELECT * FROM "${table}"`).all() as never[]),
    ]),
  )
  sqlite.close()
  const d = openSqliteDomain(path)
  const plan: Plan = {
    version: 1,
    featureLifecycle: 'current',
    sourceHash: 'test',
    target: 'test',
    initial,
    initialSchema: schema,
    expected: initial,
    expectedSchema: schema,
    groups,
    tables,
    migrations: [],
  }
  return { d, plan, path, root }
}

test('atomically converts and cleans a draft, retaining its original rows and maintenance fences', async () => {
  const { d, plan } = fixture()
  try {
    await pause(d.binding, plan)
    expect(await applyGroups(d.binding, plan)).toBe(1)
    expect(await applyGroups(d.binding, plan)).toBe(1)
    expect(d.sqlite.query('SELECT * FROM feature').all()).toEqual([])
    expect(d.sqlite.query('SELECT featureId,proposalId FROM task').get()).toEqual({
      featureId: null,
      proposalId: 'proposal',
    })
    expect(
      d.sqlite
        .query('SELECT kind,featureId,baseRevisionId FROM featureRevisionProposal')
        .get(),
    ).toEqual({ kind: 'create', featureId: null, baseRevisionId: null })
    const evidence = JSON.parse(
      (
        d.sqlite.query('SELECT legacyEvidence FROM revisionChangeSet').get() as {
          legacyEvidence: string
        }
      ).legacyEvidence,
    )
    expect(evidence.before.featureRevision[0].id).toBe('r')
    expect(evidence.before.task[0].featureId).toBe('f')
    expect(d.sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    expect(() => d.sqlite.exec("UPDATE task SET modifiedAt='outside'")).toThrow(
      'REVISION_DEPLOYMENT_MAINTENANCE',
    )
    expect(
      d.sqlite
        .query("SELECT name FROM sqlite_master WHERE name='feature_revision_no_delete'")
        .get(),
    ).not.toBeNull()
  } finally {
    d.close()
  }
})

test('refuses unexpected social references and rolls back a stale task without disabling guards', async () => {
  const { d, plan } = fixture()
  try {
    d.sqlite.exec(
      "CREATE TABLE userFeature(featureId TEXT); INSERT INTO userFeature VALUES('f')",
    )
    expect(() => prepareLegacyDraftConversion(d.sqlite)).toThrow('userFeature')
    d.sqlite.exec("DROP TABLE userFeature; UPDATE task SET modifiedAt='changed'")
    await pause(d.binding, plan)
    await expect(applyGroups(d.binding, plan)).rejects.toThrow()
    expect(d.sqlite.query('SELECT id FROM feature').get()).toEqual({ id: 'f' })
    expect(
      d.sqlite.query('SELECT legacyEvidence FROM revisionChangeSet').all(),
    ).toEqual([])
    expect(
      d.sqlite
        .query('SELECT planHash,nextGroup,writable FROM _revisionDeployment')
        .get(),
    ).toEqual({ planHash: digest(plan), nextGroup: 0, writable: 0 })
  } finally {
    d.close()
  }
})

test('rolls back a late cleanup failure and restores immutable triggers', async () => {
  const { d, plan } = fixture()
  try {
    plan.groups[0].statements.splice(-1, 0, {
      sql: "SELECT json('injected failure')",
      params: [],
    })
    await pause(d.binding, plan)
    await expect(applyGroups(d.binding, plan)).rejects.toThrow()
    expect(d.sqlite.query('SELECT id FROM feature').get()).toEqual({ id: 'f' })
    expect(
      d.sqlite.query('SELECT legacyEvidence FROM revisionChangeSet').all(),
    ).toEqual([])
    expect(
      d.sqlite
        .query("SELECT name FROM sqlite_master WHERE name='feature_revision_no_delete'")
        .get(),
    ).not.toBeNull()
    expect(
      d.sqlite.query('SELECT nextGroup,writable FROM _revisionDeployment').get(),
    ).toEqual({ nextGroup: 0, writable: 0 })
  } finally {
    d.close()
  }
})

test('the managed planner detects current lifecycle storage and verifies its cleanup plan', async () => {
  const { d, path, root } = fixture()
  try {
    for (const resource of ['organisation', 'project', 'layer', 'hub'])
      d.sqlite.exec(
        `CREATE TABLE ${resource}(id TEXT,imageId TEXT); CREATE TABLE ${resource}RevisionHead(${resource}Id TEXT); CREATE TABLE ${resource}RevisionWrite(id TEXT)`,
      )
    d.sqlite.exec(
      'CREATE TABLE resourceLogoImageHead(imageId TEXT); CREATE TABLE propertyCatalogRevisionHead(scope TEXT,resourceId TEXT); CREATE TABLE propertyCatalogRevisionWrite(id TEXT); CREATE TABLE featureRevisionWriteScope(featureId TEXT); CREATE TABLE d1_migrations(name TEXT)',
    )
    // Model a converted target missing both the compatibility policy and a later numbered migration.
    const retireRecorder = '0264_remove_web_field_recorder.sql'
    d.sqlite.exec('CREATE TABLE fieldRecorderConfig(id TEXT)')
    for (const name of readdirSync('migrations').filter(name => name.endsWith('.sql')))
      if (!['0203_revision_edit_windows.sql', retireRecorder].includes(name))
        d.sqlite.query('INSERT INTO d1_migrations(name) VALUES (?)').run(name)
    for (const resource of ['organisation', 'project', 'layer', 'hub']) {
      d.sqlite.exec(`CREATE TABLE ${resource}Revision(id TEXT PRIMARY KEY,${resource}Id TEXT,previousRevisionId TEXT,changeSetId TEXT,content TEXT,schemaVersion INTEGER);
        ALTER TABLE ${resource}RevisionHead ADD COLUMN currentRevisionId TEXT;
        ALTER TABLE ${resource}RevisionWrite ADD COLUMN ${resource}Id TEXT;
        ALTER TABLE ${resource}RevisionWrite ADD COLUMN revisionId TEXT;
        CREATE TRIGGER ${resource}_revision_immutable_update BEFORE UPDATE ON ${resource}Revision BEGIN SELECT RAISE(ABORT,'immutable'); END;`)
      if (resource !== 'layer')
        d.sqlite.exec(`CREATE TABLE ${resource}RevisionLogo(revisionId TEXT,imageId TEXT,imageRevisionId TEXT);
        CREATE TRIGGER ${resource}_revision_logo_no_delete BEFORE DELETE ON ${resource}RevisionLogo BEGIN SELECT RAISE(ABORT,'immutable'); END;`)
    }
    d.sqlite.exec(`CREATE TABLE propertyCatalogRevision(id TEXT,scope TEXT,resourceId TEXT,previousRevisionId TEXT,changeSetId TEXT,content TEXT);
      ALTER TABLE propertyCatalogRevisionHead ADD COLUMN currentRevisionId TEXT;
      ALTER TABLE propertyCatalogRevisionWrite ADD COLUMN scope TEXT;
      ALTER TABLE propertyCatalogRevisionWrite ADD COLUMN resourceId TEXT;
      ALTER TABLE propertyCatalogRevisionWrite ADD COLUMN token TEXT;
      CREATE TRIGGER property_catalog_revision_update BEFORE UPDATE ON propertyCatalogRevision BEGIN SELECT RAISE(ABORT,'immutable'); END;
      CREATE TABLE imageIntentPolicyRevision(id TEXT,scopeType TEXT,scopeId TEXT,actorId TEXT,createdAt TEXT,previous TEXT,current TEXT);
      CREATE TRIGGER image_intent_history_no_update BEFORE UPDATE ON imageIntentPolicyRevision BEGIN SELECT RAISE(ABORT,'immutable'); END;
      CREATE TABLE featureIdentityOperationMember(revisionId TEXT);
      CREATE TRIGGER feature_revision_no_update BEFORE UPDATE ON featureRevision BEGIN SELECT RAISE(ABORT,'immutable'); END;
      CREATE TRIGGER feature_review_no_update BEFORE UPDATE ON featureRevisionReview BEGIN SELECT RAISE(ABORT,'immutable'); END;
      CREATE TRIGGER featureRevisionImage_immutable_delete BEFORE DELETE ON featureRevisionImage BEGIN SELECT RAISE(ABORT,'immutable'); END;`)
    for (const [table, columns] of Object.entries({
      featureRevision: [
        'previousRevisionId',
        'mergedFromRevisionId',
        'changeSetId',
        'schemaVersion',
        'legacyEvidence',
        'baselineAttribution',
      ],
      featureRevisionReview: [
        'proposalId',
        'proposalVersion',
        'changes',
        'comparedRevisionId',
        'resultingRevisionId',
        'context',
        'resolutions',
        'action',
        'changeSetId',
      ],
      featureRevisionImage: ['imageRevisionId', 'position', 'intent'],
    }))
      for (const column of columns)
        d.sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`)
    const plan = await prepareRelease(path, join(root, 'release'), 'local:test')
    expect(plan.featureLifecycle).toBe('current')
    expect(plan.groups).toHaveLength(3)
    expect(plan.groups[1].label).toBe(retireRecorder)
    await pause(d.binding, plan)
    await applyGroups(d.binding, plan)
    expect(
      d.sqlite
        .query("SELECT 1 FROM sqlite_schema WHERE name='fieldRecorderConfig'")
        .get(),
    ).toBeNull()
    await markVerified(d.binding, plan)
    expect(
      d.sqlite.query('SELECT phase,writable FROM _revisionDeployment').get(),
    ).toEqual({ phase: 'verified', writable: 0 })
  } finally {
    d.close()
  }
})
