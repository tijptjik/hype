// @vitest-environment node
// TESTS
import { afterEach, beforeEach, expect, it } from 'vitest'
import { publicationSqlite } from './fixtures/publicationSqlite'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { user } from '#lib/db/schema/user.js'
// SERVICES
import { listResourceChangelog } from '#lib/db/services/resourceChangelog.js'
import { canReadUserChangelog } from '#lib/db/services/userChangelogScope.js'
// TYPES
import type { Database } from '#lib/types.js'

let fixture: ReturnType<typeof publicationSqlite>
let db: Database
const scope = { resource: 'user' as const, id: 'editor', viewerId: 'viewer' }
const read = (before?: { createdAt: string; key: string }) =>
  listResourceChangelog(db, {
    scope,
    before,
    locales: ['en'],
    authorize: () => true,
    includeFilterOptions: true,
    internalIds: new Set(),
    allowedInternalIds: new Set(),
  })
beforeEach(() => {
  fixture = publicationSqlite({})
  db = fixture.db as unknown as Database
  fixture.sqlite.exec(`
    CREATE TABLE user(${getTableConfig(user)
      .columns.map(column => `"${column.name}" ${column.getSQLType()}`)
      .join(',')});
    INSERT INTO user(id,name) VALUES('editor','Editor'),('viewer','Viewer'),('other','Other');
    CREATE TABLE hub(id TEXT PRIMARY KEY,code TEXT,isArchived INTEGER DEFAULT 0);
    INSERT INTO hub(id,code) VALUES('h','one'),('h2','two'),('core','core');
    CREATE TABLE organisation(id TEXT PRIMARY KEY,hubId TEXT,isArchived INTEGER DEFAULT 0);
    INSERT INTO organisation(id,hubId) VALUES('o','h'),('o2','h2');
    CREATE TABLE project(id TEXT PRIMARY KEY,organisationId TEXT,isArchived INTEGER DEFAULT 0);
    INSERT INTO project(id,organisationId) VALUES('p','o'),('sibling','o'),('p2','o2');
    CREATE TABLE layer(id TEXT PRIMARY KEY,organisationId TEXT,projectId TEXT,isArchived INTEGER DEFAULT 0);
    INSERT INTO layer(id,organisationId,projectId) VALUES('l','o','p'),('l2','o2','p2');
    CREATE TABLE hubRole(userId TEXT,hubId TEXT,role TEXT);
    CREATE TABLE organisationRole(userId TEXT,organisationId TEXT,role TEXT);
    CREATE TABLE projectRole(userId TEXT,projectId TEXT,role TEXT);
    INSERT INTO organisationRole VALUES('editor','o','member');
    CREATE TABLE revisionChangeSet(id TEXT PRIMARY KEY,createdAt TEXT,actorId TEXT,origin TEXT,reason TEXT);
  `)
  for (const resource of ['hub', 'organisation', 'project', 'layer']) {
    fixture.sqlite.exec(`CREATE TABLE ${resource}I18n(${resource}Id TEXT,locale TEXT,name TEXT);
      CREATE TABLE ${resource}Revision(id TEXT PRIMARY KEY,${resource}Id TEXT,previousRevisionId TEXT,content TEXT,changeSetId TEXT);`)
  }
  for (const [resource, id] of [
    ['hub', 'h'],
    ['hub', 'h2'],
    ['organisation', 'o'],
    ['organisation', 'o2'],
    ['project', 'p'],
    ['project', 'sibling'],
    ['project', 'p2'],
    ['layer', 'l'],
    ['layer', 'l2'],
  ]) {
    const key = `${resource}-${id}`
    fixture.sqlite
      .prepare('INSERT INTO revisionChangeSet VALUES(?,?,?,?,?)')
      .run(key, '2026-11-06T12:00:00.000Z', 'editor', 'user', null)
    fixture.sqlite
      .prepare(`INSERT INTO ${resource}Revision VALUES(?,?,?,?,?)`)
      .run(key, id, null, '{}', key)
  }
})
afterEach(() => fixture.sqlite.close())

it('denies member/user viewers and subjects with only user membership', async () => {
  fixture.sqlite.exec("INSERT INTO organisationRole VALUES('viewer','o','member')")
  expect(await canReadUserChangelog(db, scope)).toBe(false)
  expect((await read()).entries).toEqual([])
  fixture.sqlite.exec(
    "UPDATE organisationRole SET role='owner' WHERE userId='viewer'; UPDATE organisationRole SET role='user' WHERE userId='editor'",
  )
  expect(await canReadUserChangelog(db, scope)).toBe(false)
  expect((await read()).entries).toEqual([])
})

it('gives organisation owners only their organisation and descendants', async () => {
  fixture.sqlite.exec("INSERT INTO organisationRole VALUES('viewer','o','owner')")
  expect(await canReadUserChangelog(db, scope)).toBe(true)
  expect((await read()).entries.map(e => e.resourceId).sort()).toEqual([
    'l',
    'o',
    'p',
    'sibling',
  ])
})

it.each(['owner', 'maintainer'])('keeps project %s below its project', async role => {
  fixture.sqlite
    .prepare('INSERT INTO projectRole VALUES(?,?,?)')
    .run('viewer', 'p', role)
  expect((await read()).entries.map(e => e.resourceId).sort()).toEqual(['l', 'p'])
  fixture.sqlite.exec("UPDATE layer SET isArchived=1 WHERE id='l'")
  expect((await read()).entries.map(e => e.resourceId).sort()).toEqual(
    role === 'owner' ? ['l', 'p'] : ['p'],
  )
})

it('scopes hub admins and preserves global core/super-admin access', async () => {
  fixture.sqlite.exec("INSERT INTO hubRole VALUES('viewer','h','admin')")
  expect((await read()).entries.map(e => e.resourceId).sort()).toEqual([
    'h',
    'l',
    'o',
    'p',
    'sibling',
  ])
  fixture.sqlite.exec("UPDATE hubRole SET hubId='core'")
  expect((await read()).entries).toHaveLength(9)
  fixture.sqlite.exec('DELETE FROM hubRole')
  expect((await read()).entries).toHaveLength(0)
})

it('rechecks moves, inconsistent ancestry, subject demotion and viewer revocation', async () => {
  fixture.sqlite.exec(
    "INSERT INTO organisationRole VALUES('viewer','o','owner'); UPDATE project SET organisationId='o2' WHERE id='p'",
  )
  expect((await read()).entries.map(e => e.resourceId).sort()).toEqual(['o', 'sibling'])
  fixture.sqlite.exec("DELETE FROM organisationRole WHERE userId='editor'")
  expect((await read()).entries).toEqual([])
  fixture.sqlite.exec(
    "INSERT INTO projectRole VALUES('editor','p','translator'); DELETE FROM organisationRole WHERE userId='viewer'",
  )
  expect((await read()).entries).toEqual([])
})

it('filters attribution and hidden rows before pagination and filter metadata', async () => {
  fixture.sqlite.exec("INSERT INTO projectRole VALUES('viewer','p','maintainer')")
  for (let index = 0; index < 60; index++) {
    const id = `hidden-${index}`
    fixture.sqlite
      .prepare('INSERT INTO revisionChangeSet VALUES(?,?,?,?,?)')
      .run(id, '2026-11-07T12:00:00.000Z', 'editor', 'user', null)
    fixture.sqlite
      .prepare('INSERT INTO projectRevision VALUES(?,?,?,?,?)')
      .run(id, 'p2', null, '{}', id)
  }
  fixture.sqlite.exec("UPDATE revisionChangeSet SET actorId='other' WHERE id='layer-l'")
  const result = await read()
  expect(result.entries.map(e => e.resourceId)).toEqual(['p'])
  expect(result.nextCursor).toBeNull()
  expect(result.filterOptions?.actors.map(a => a.id)).toEqual(['editor'])
  expect(result.filterOptions?.period?.to).toBe('2026-11-06T12:00:00.000Z')
})

it('paginates same-timestamp authored changes without gaps or duplicates', async () => {
  fixture.sqlite.exec("INSERT INTO projectRole VALUES('viewer','p','owner')")
  for (let index = 0; index < 30; index++) {
    const id = `entry-${index}`
    fixture.sqlite
      .prepare('INSERT INTO revisionChangeSet VALUES(?,?,?,?,?)')
      .run(id, '2026-11-06T12:00:00.000Z', 'editor', 'user', null)
    fixture.sqlite
      .prepare('INSERT INTO projectRevision VALUES(?,?,?,?,?)')
      .run(id, 'p', null, '{}', id)
  }
  const first = await read()
  const second = await read(first.nextCursor!)
  expect(first.entries).toHaveLength(25)
  expect(second.entries).toHaveLength(7)
  expect(new Set([...first.entries, ...second.entries].map(e => e.key)).size).toBe(32)
  expect(second.nextCursor).toBeNull()
})

it('includes retained baseline attribution like the resource actor filter, without changing provenance or scope', async () => {
  fixture.sqlite.exec(`
    INSERT INTO projectRole VALUES('viewer','p','owner');
    CREATE TABLE feature(id TEXT PRIMARY KEY,organisationId TEXT,projectId TEXT,layerId TEXT,isArchived INTEGER DEFAULT 0);
    CREATE TABLE featureI18n(featureId TEXT,locale TEXT,title TEXT);
    CREATE TABLE featureRevision(id TEXT PRIMARY KEY,featureId TEXT,content TEXT);
    CREATE TABLE featureRevisionHead(featureId TEXT PRIMARY KEY,publishedRevisionId TEXT,generation INTEGER);
    CREATE TABLE featureRevisionPublication(id TEXT PRIMARY KEY,featureId TEXT,previousRevisionId TEXT,revisionId TEXT,generation INTEGER,changeSetId TEXT);
    CREATE TABLE featureBaselineAttribution(featureId TEXT,publicationId TEXT,contributorId TEXT,reviewerId TEXT);
    INSERT INTO revisionChangeSet VALUES('migration','2026-11-06T12:00:00.000Z','system:enrollment','migration',NULL);
    INSERT INTO feature VALUES('own','o','p','l',0),('reviewed','o','p','l',0),('unknown','o','p','l',0),('outside','o2','p2','l2',0);
    INSERT INTO featureRevisionPublication VALUES('own','own',NULL,NULL,0,'migration'),('reviewed','reviewed',NULL,NULL,0,'migration'),('unknown','unknown',NULL,NULL,0,'migration'),('outside','outside',NULL,NULL,0,'migration');
    INSERT INTO featureBaselineAttribution VALUES('own','own','editor',NULL),('reviewed','reviewed','editor','other'),('outside','outside','editor',NULL);
  `)
  const result = await read()
  const baselines = result.entries.filter(entry => entry.baseline)
  expect(baselines).toHaveLength(1)
  expect(baselines[0]).toMatchObject({
    resourceId: 'own',
    origin: 'migration',
    actorId: 'system:enrollment',
    baselineActor: { actorId: 'editor', role: 'contributor' },
  })
  const resource = await listResourceChangelog(db, {
    scope: {
      resource: 'project',
      id: 'p',
      projectId: 'p',
      organisationId: 'o',
      hubId: 'h',
    },
    locales: ['en'],
    authorize: () => true,
    filters: { actor: { id: 'editor', origin: 'user' } },
    internalIds: new Set(),
    allowedInternalIds: new Set(),
  })
  expect(result.entries.map(entry => entry.key)).toEqual(
    resource.entries.map(entry => entry.key),
  )
  expect(result.filterOptions?.actors.map(actor => actor.id)).toEqual(['editor'])
  fixture.sqlite.exec(
    "UPDATE featureBaselineAttribution SET reviewerId='editor',contributorId='other' WHERE featureId='own'",
  )
  expect(
    (await read()).entries.find(entry => entry.resourceId === 'own')?.baselineActor
      ?.role,
  ).toBe('reviewer')
})
