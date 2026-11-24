import { test, expect } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { openSqliteDomain } from '../../locations/lib/sqlite-domain'
import {
  applyGroups,
  digest,
  fingerprint,
  journal,
  pause,
  schemaFingerprint,
} from './contract'
import type { Plan } from './contract'
import { finishDataRelease, rebaseDataRelease } from './data-release'

test('data release restores the exact app journal and accepts a lost-response retry', async () => {
  const root = mkdtempSync(join(tmpdir(), 'data-release-')),
    path = join(root, 'test.sqlite')
  new Database(path).close()
  const d = openSqliteDomain(path)
  try {
    d.sqlite.exec(`CREATE TABLE content(id TEXT PRIMARY KEY,value TEXT);
      INSERT INTO content VALUES('one','before');
      CREATE TABLE _revisionDeployment(singleton INTEGER PRIMARY KEY,planHash TEXT,nextGroup INTEGER,phase TEXT,writable INTEGER,previousHash TEXT,irreversible INTEGER,schemaBoundary INTEGER);
      INSERT INTO _revisionDeployment VALUES(1,'app',17,'active',0,NULL,1,0);
      CREATE TABLE feature(id TEXT,currentRevisionId TEXT,revisionVersion INTEGER);
      CREATE TABLE featureRevision(id TEXT,featureId TEXT,sequence INTEGER);
      CREATE TABLE task(proposalId TEXT,isDraft INTEGER,type TEXT,featureId TEXT);
      CREATE TABLE featureRevisionProposal(id TEXT,creationScope TEXT);
      CREATE TABLE resourceLogoImageHead(imageId TEXT);
      CREATE TABLE propertyCatalogRevisionHead(scope TEXT,resourceId TEXT);
      CREATE TABLE featureRevisionWriteScope(id TEXT);`)
    for (const resource of ['organisation', 'project', 'layer', 'hub']) {
      d.sqlite.exec(`CREATE TABLE ${resource}(id TEXT,imageId TEXT);
        CREATE TABLE ${resource}RevisionHead(${resource}Id TEXT);
        CREATE TABLE ${resource}RevisionWrite(id TEXT);`)
    }
    d.sqlite.exec('CREATE TABLE propertyCatalogRevisionWrite(id TEXT)')
    const shape = schemaFingerprint(
      d.sqlite
        .query('SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL')
        .all() as any,
    )
    let plan: Plan = {
      version: 1,
      featureLifecycle: 'current',
      target: 'production:test',
      parentHash: 'app',
      parentCursor: 17,
      sourceHash: 'source',
      initialSchema: shape,
      expectedSchema: shape,
      initial: { content: fingerprint([{ id: 'one', value: 'before' }]) },
      expected: { content: fingerprint([{ id: 'one', value: 'after' }]) },
      tables: ['content'],
      migrations: [],
      groups: [
        {
          label: 'data',
          statements: [{ sql: "UPDATE content SET value='after'", params: [] }],
        },
      ],
    }
    const original = (await journal(d.binding))!
    await pause(d.binding, plan)
    await expect(
      d.binding.prepare("UPDATE content SET value='external'").run(),
    ).rejects.toThrow('REVISION_DEPLOYMENT_MAINTENANCE')
    const replacement = { ...plan, sourceHash: 'fenced-rebase' }
    await rebaseDataRelease(d.binding, replacement, digest(plan), original)
    await rebaseDataRelease(d.binding, replacement, digest(plan), original)
    plan = replacement
    await applyGroups(d.binding, plan)
    await expect(
      rebaseDataRelease(
        d.binding,
        { ...plan, sourceHash: 'too-late' },
        digest(plan),
        original,
      ),
    ).rejects.toThrow('exact unstarted fence')
    await finishDataRelease(d.binding, plan, original)
    expect(await journal(d.binding)).toEqual(original)
    await finishDataRelease(d.binding, plan, original)
    expect(d.sqlite.query('SELECT value FROM content').get()).toEqual({
      value: 'after',
    })
    await expect(
      pause(d.binding, { ...plan, parentHash: 'other-app' }),
    ).rejects.toThrow()
    expect(await journal(d.binding)).toEqual(original)
  } finally {
    d.close()
    rmSync(root, { recursive: true, force: true })
  }
})
