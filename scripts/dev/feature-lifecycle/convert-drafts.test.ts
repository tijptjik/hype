import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { featureRevisionContentFixture } from '../../../src/tests/fixtures/featureRevisionContent'
import { prepareLegacyDraftConversion } from './convert-drafts'
import { openSqliteDomain } from '../../locations/lib/sqlite-domain'
import {
  applyGroups,
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
    CREATE TABLE featureOrigin(featureId TEXT PRIMARY KEY REFERENCES feature(id),origin TEXT,originId TEXT,recordedAt TEXT,recordedBy TEXT);
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
    INSERT INTO featureOrigin VALUES('f','admin_contribution',NULL,'legacy-clock',NULL);
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
    'featureOrigin',
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
    expect(evidence.before.featureOrigin).toEqual([
      {
        featureId: 'f',
        origin: 'admin_contribution',
        originId: null,
        recordedAt: 'legacy-clock',
        recordedBy: null,
      },
    ])
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
