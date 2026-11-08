// TESTS
import { afterEach, beforeEach, expect, it } from 'vitest'
// DRIZZLE
import { sql } from 'drizzle-orm'
// HISTORY
import {
  listAdminResourceHistory,
  listOrganisationHistory,
  listPropertyCatalogHistory,
} from '#lib/db/services/resourceHistory.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database } from '#lib/types.js'

let fixture: ReturnType<typeof publicationSqlite>
let db: Database
beforeEach(() => {
  fixture = publicationSqlite({})
  db = fixture.db as unknown as Database
  fixture.sqlite.exec(`
    CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,username TEXT,displayUsername TEXT,image TEXT);
    INSERT INTO user VALUES('editor','History Editor','history.editor','History.Editor','/avatar.png');
    CREATE TABLE organisation(id TEXT PRIMARY KEY,hubId TEXT);
    INSERT INTO organisation VALUES('org','hub');
    CREATE TABLE hub(id TEXT PRIMARY KEY);
    INSERT INTO hub VALUES('hub');
    CREATE TABLE project(id TEXT PRIMARY KEY,organisationId TEXT);
    INSERT INTO project VALUES('project','org');
    CREATE TABLE layer(id TEXT PRIMARY KEY,projectId TEXT,organisationId TEXT);
    INSERT INTO layer VALUES('layer','project','org');
    CREATE TABLE adminResourceRevisionRollout(resource TEXT PRIMARY KEY,enabled INTEGER);
    INSERT INTO adminResourceRevisionRollout VALUES('hub',1),('project',1),('layer',1);
    CREATE TABLE revisionChangeSet(id TEXT PRIMARY KEY,actorId TEXT,origin TEXT,reason TEXT,createdAt TEXT);
    INSERT INTO revisionChangeSet VALUES('baseline','legacy','migration',NULL,'2026-11-05T09:00:00Z'),('edit','editor','user',NULL,'2026-11-05T10:00:00Z');
  `)
  for (const resource of ['organisation', 'hub', 'project', 'layer']) {
    fixture.sqlite.exec(`
      CREATE TABLE ${resource}Revision(id TEXT PRIMARY KEY,${resource}Id TEXT,changeSetId TEXT,previousRevisionId TEXT,content TEXT);
      CREATE TABLE ${resource}RevisionHead(id TEXT);
      CREATE TABLE ${resource}RevisionWrite(id TEXT);
      INSERT INTO ${resource}Revision VALUES('before','${resource === 'organisation' ? 'org' : resource}','baseline',NULL,'{"record":{"code":"before"}}'),('after','${resource === 'organisation' ? 'org' : resource}','edit','before','{"record":{"code":"after"}}');
    `)
  }
})
afterEach(() => fixture.sqlite.close())

it.each(['hub', 'project', 'layer'] as const)(
  'attributes %s reads while preserving history after account deletion and fencing ancestry',
  async resource => {
    const input = {
      resource,
      id: resource,
      organisationId: 'org',
      projectId: 'project',
      hubId: 'hub',
    }
    const result = await listAdminResourceHistory(db, input)
    expect(result.entries).toHaveLength(2)
    expect(result.recordingEnabled).toBe(true)
    expect(result.entries[0].actor).toEqual({
      name: 'History Editor',
      username: 'history.editor',
      displayUsername: 'History.Editor',
      image: '/avatar.png',
    })
    expect(result.entries[0].changes).toEqual([
      {
        path: ['record', 'code'],
        before: { present: true, value: 'before' },
        after: { present: true, value: 'after' },
      },
    ])
    expect(result.entries[1].actor).toBeNull()
    fixture.sqlite.exec("DELETE FROM user WHERE id='editor'")
    expect((await listAdminResourceHistory(db, input)).entries[0]).toMatchObject({
      actorId: 'editor',
      actor: null,
    })
    if (resource !== 'hub')
      expect(
        (await listAdminResourceHistory(db, { ...input, hubId: 'wrong' })).entries,
      ).toEqual([])
  },
)

it('reads organisation attribution only in its current hub', async () => {
  const result = await listOrganisationHistory(db, {
    organisationId: 'org',
    hubId: 'hub',
  })
  expect(result.entries[0].actor?.username).toBe('history.editor')
  expect(result.entries[0].previousCreatedAt).toBe('2026-11-05T09:00:00Z')
  expect(
    (await listOrganisationHistory(db, { organisationId: 'org', hubId: 'other' }))
      .entries,
  ).toEqual([])
})

it('retains removed field labels and editor profiles in catalogue comparisons', async () => {
  fixture.sqlite.exec(`CREATE TABLE propertyCatalogRevision(id TEXT,scope TEXT,resourceId TEXT,changeSetId TEXT,previousRevisionId TEXT,content TEXT);
    CREATE TABLE propertyCatalogRevisionHead(id TEXT); CREATE TABLE propertyCatalogRevisionWrite(id TEXT);
    INSERT INTO propertyCatalogRevision VALUES('before','organisation','org','baseline',NULL,'{"contact":{"i18n":{"en":{"label":"Contact method"}}}}'),('after','organisation','org','edit','before','{}');`)
  const result = await listPropertyCatalogHistory(
    db,
    { scope: 'organisation', id: 'org' },
    sql`1`,
  )
  expect(result.entries[0]).toMatchObject({
    actor: { username: 'history.editor' },
    fieldLabels: { contact: 'Contact method' },
    changes: [{ path: ['contact'], after: { present: false } }],
  })
  expect(
    (await listPropertyCatalogHistory(db, { scope: 'organisation', id: 'org' }, sql`0`))
      .entries,
  ).toEqual([])
})

it('distinguishes missing storage from an incomplete rollout', async () => {
  fixture.sqlite.exec(
    'DROP TABLE hubRevision; DROP TABLE hubRevisionHead; DROP TABLE hubRevisionWrite;',
  )
  expect(await listAdminResourceHistory(db, { resource: 'hub', id: 'hub' })).toEqual({
    available: false,
    entries: [],
    nextCursor: null,
  })
  fixture.sqlite.exec('CREATE TABLE hubRevision(id TEXT);')
  await expect(
    listAdminResourceHistory(db, { resource: 'hub', id: 'hub' }),
  ).rejects.toThrow('Incomplete hub revision migration')
})

it.each(['organisation', 'hub', 'project'] as const)(
  'includes pinned logo display-mode changes in %s History',
  async resource => {
    fixture.sqlite.exec(`CREATE TABLE imageRevision(id TEXT PRIMARY KEY,imageId TEXT,metadata TEXT);
      INSERT INTO imageRevision VALUES('old','logo','{"presentationMode":"cover","rotation":0}'),('new','logo','{"presentationMode":"cast-edges","rotation":90}');`)
    for (const [id, revision] of [
      ['before', 'old'],
      ['after', 'new'],
    ]) {
      fixture.sqlite.prepare(`UPDATE ${resource}Revision SET content=? WHERE id=?`).run(
        JSON.stringify({
          record: { imageId: 'logo' },
          logo: { imageId: 'logo', imageRevisionId: revision },
        }),
        id,
      )
    }
    const result =
      resource === 'organisation'
        ? await listOrganisationHistory(db, { organisationId: 'org', hubId: 'hub' })
        : await listAdminResourceHistory(db, {
            resource,
            id: resource,
            organisationId: 'org',
            hubId: 'hub',
          })
    expect(result.entries[0].changes).toContainEqual({
      path: ['logo', 'rotation'],
      before: { present: true, value: 0 },
      after: { present: true, value: 90 },
    })
    expect(result.entries[0].changes).toContainEqual({
      path: ['logo', 'presentationMode'],
      before: { present: true, value: 'cover' },
      after: { present: true, value: 'cast-edges' },
    })
  },
)
