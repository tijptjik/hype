// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// DRIZZLE
import { sql } from 'drizzle-orm'
// TESTS
import { afterEach, beforeEach, expect, it } from 'vitest'
import { publicationSqlite } from './fixtures/publicationSqlite'
// SERVICES
import {
  listStaffRoleHistory,
  prepareStaffRoleHistoryContext,
} from '#lib/db/services/staffRoleHistory.js'
import { prepareAdminResourceRevisionCapture } from '#lib/db/services/adminResourceRevision.js'
import { executeRevisionBatch } from '#lib/db/services/revisionBatch.js'
// SCHEMA
import { hubRole, projectRole, organisationRole } from '#lib/db/schema/index.js'
// TYPES
import type { Database } from '#lib/types.js'

let f: ReturnType<typeof publicationSqlite>
let db: Database
beforeEach(() => {
  f = publicationSqlite({}, 100)
  db = f.db as unknown as Database
  f.sqlite.exec(`
    CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,username TEXT,displayUsername TEXT,image TEXT);
    INSERT INTO user VALUES ('actor','Editor','editor','Editor',NULL),('subject','Staff','staff','Staff',NULL);
    CREATE TABLE hub(id TEXT PRIMARY KEY);
    INSERT INTO hub VALUES ('h');
    CREATE TABLE hubRole(hubId TEXT,userId TEXT,role TEXT,PRIMARY KEY(hubId,userId));
    CREATE TABLE projectRole(projectId TEXT,userId TEXT,role TEXT,capabilities TEXT,PRIMARY KEY(projectId,userId));
    CREATE TABLE organisationRole(organisationId TEXT,userId TEXT,role TEXT,viewAnalytics INTEGER,grant TEXT,PRIMARY KEY(organisationId,userId));
    INSERT INTO hubRole VALUES ('h','subject','admin');
  `)
  f.sqlite.exec(readFileSync('migrations/0248_staff_role_history.sql', 'utf8'))
})
afterEach(() => f.sqlite.close())

it('labels existing assignments as an unknown-author baseline and denies a changed scope', async () => {
  const page = await listStaffRoleHistory(db, { resource: 'hub', id: 'h' }, sql`1`)
  expect(page.entries).toHaveLength(1)
  expect(page.entries[0]).toMatchObject({
    initial: true,
    origin: 'migration',
    fieldLabels: { subject: '@Staff' },
  })
  expect(
    (await listStaffRoleHistory(db, { resource: 'hub', id: 'h' }, sql`0`)).entries,
  ).toEqual([])
})

it('attributes removal independently of profile rollout and clears its transaction context', async () => {
  const capture = await prepareAdminResourceRevisionCapture(
    db,
    'hub',
    sql`SELECT 'h' id`,
    { actorId: 'actor' },
  )
  await db.batch([...capture.before, db.delete(hubRole), ...capture.after] as never)
  const page = await listStaffRoleHistory(db, { resource: 'hub', id: 'h' }, sql`1`)
  expect(page.entries[0]).toMatchObject({
    actorId: 'actor',
    actor: { username: 'editor' },
    changes: [{ path: ['subject'], after: { present: false } }],
  })
  expect(
    f.sqlite.prepare('SELECT count(*) n FROM staffRoleHistoryContext').get(),
  ).toMatchObject({ n: 0 })
})

it('suppresses unchanged delete/reinsert replacement and groups nested captures', async () => {
  const a = await prepareStaffRoleHistoryContext(db, { actorId: 'actor' })
  const b = await prepareStaffRoleHistoryContext(db, { actorId: 'actor' })
  await db.batch([
    ...a.before,
    ...b.before,
    db.delete(hubRole),
    db.insert(hubRole).values({ hubId: 'h', userId: 'subject', role: 'admin' }),
    ...b.after,
    ...a.after,
  ] as never)
  expect(
    (await listStaffRoleHistory(db, { resource: 'hub', id: 'h' }, sql`1`)).entries,
  ).toHaveLength(1)
})

it('records project role and capability changes together and preserves evidence after account deletion', async () => {
  f.sqlite.exec(
    `INSERT INTO projectRole VALUES ('p','subject','member','{"edit":false}');`,
  )
  const c = await prepareStaffRoleHistoryContext(db, { actorId: 'actor' })
  await db.batch([
    ...c.before,
    db
      .update(projectRole)
      .set({ role: 'maintainer', capabilities: sql`'{"edit":true}'` }),
    ...c.after,
  ] as never)
  f.sqlite.exec("DELETE FROM user WHERE id='subject'")
  const page = await listStaffRoleHistory(db, { resource: 'project', id: 'p' }, sql`1`)
  expect(page.entries[0].changes.map(c => c.path)).toEqual([
    ['subject', 'capabilities', 'edit'],
    ['subject', 'role'],
  ])
  expect(page.entries[0].fieldLabels).toEqual({ subject: '@Staff' })
  expect(page.entries[0].staffProfiles).toEqual({ subject: { username: null } })
})

it('captures independent organisation staff grants but excludes audience-only assignments', async () => {
  f.sqlite.exec(
    `INSERT INTO organisationRole VALUES ('o','audience','user',0,'{"import":"user"}');`,
  )
  expect(
    (await listStaffRoleHistory(db, { resource: 'organisation', id: 'o' }, sql`1`))
      .entries,
  ).toEqual([])
  const c = await prepareStaffRoleHistoryContext(db, { actorId: 'actor' })
  await db.batch([
    ...c.before,
    db.insert(organisationRole).values({
      organisationId: 'o',
      userId: 'subject',
      role: 'member',
      viewAnalytics: true,
      grant: { manual: 'member' },
    }),
    ...c.after,
  ] as never)
  const page = await listStaffRoleHistory(
    db,
    { resource: 'organisation', id: 'o' },
    sql`1`,
  )
  expect(page.entries[0].changes[0].after).toMatchObject({
    present: true,
    value: { role: 'member', viewAnalytics: true, grants: { manual: 'member' } },
  })
})

it('rolls back attribution and evidence with a failed or stale parent save', async () => {
  const c = await prepareStaffRoleHistoryContext(db, { actorId: 'actor' })
  expect(
    await executeRevisionBatch(db, sql`0`, [
      ...c.before,
      db.delete(hubRole),
      ...c.after,
    ]),
  ).toBeNull()
  await expect(
    db.batch([
      ...c.before,
      db.delete(hubRole),
      db.insert(hubRole).values([
        { hubId: 'h', userId: 'subject', role: 'admin' },
        { hubId: 'h', userId: 'subject', role: 'admin' },
      ]),
      ...c.after,
    ] as never),
  ).rejects.toThrow()
  expect(
    (await listStaffRoleHistory(db, { resource: 'hub', id: 'h' }, sql`1`)).entries,
  ).toHaveLength(1)
  expect(
    f.sqlite.prepare('SELECT count(*) n FROM staffRoleHistoryContext').get(),
  ).toMatchObject({ n: 0 })
})

it('paginates complete change groups without losing equal-timestamp events', async () => {
  for (let n = 0; n < 35; n++)
    f.sqlite.exec(`INSERT INTO hubRole VALUES ('other','u${n}','admin')`)
  const a = await listStaffRoleHistory(db, { resource: 'hub', id: 'other' }, sql`1`)
  if (a.nextCursor === null) throw new Error('Expected another history page')
  const b = await listStaffRoleHistory(
    db,
    { resource: 'hub', id: 'other', before: a.nextCursor },
    sql`1`,
  )
  expect(a.entries).toHaveLength(30)
  expect(b.entries).toHaveLength(5)
  expect(new Set([...a.entries, ...b.entries].map(e => e.id)).size).toBe(35)
  expect(b.nextCursor).toBeNull()
  expect(a.entries[0].actorId).toBe('system:unattributed-role-write')
  expect(() => f.sqlite.exec('DELETE FROM staffRoleHistory')).toThrow('immutable')
})

it('preserves the final effective grant through real organisation normalization triggers', async () => {
  // Install the production grant triggers, including role derivation and last-grant deletion.
  const source = readFileSync('migrations/0168_organisation_users.sql', 'utf8')
  const triggers = source.slice(
    source.indexOf('CREATE TRIGGER organisationRole_validate_insert'),
  )
  f.sqlite.exec(triggers)
  f.sqlite.exec(
    `INSERT INTO organisationRole VALUES ('o','subject','owner',0,'{"manual":"owner","project:p":"member"}')`,
  )
  const capture = await prepareStaffRoleHistoryContext(db, { actorId: 'actor' })
  await db.batch([
    ...capture.before,
    db.update(organisationRole).set({ grant: sql`'{"project:p":"member"}'` }),
    ...capture.after,
  ] as never)
  const page = await listStaffRoleHistory(
    db,
    { resource: 'organisation', id: 'o' },
    sql`1`,
  )
  expect(page.entries[0].changes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path: ['subject', 'role'],
        before: { present: true, value: 'owner' },
        after: { present: true, value: 'member' },
      }),
      expect.objectContaining({
        path: ['subject', 'grants', 'manual'],
        after: { present: false },
      }),
    ]),
  )
  const removal = await prepareStaffRoleHistoryContext(db, { actorId: 'actor' })
  await db.batch([
    ...removal.before,
    db.update(organisationRole).set({ grant: {} }),
    ...removal.after,
  ] as never)
  const last = await listStaffRoleHistory(
    db,
    { resource: 'organisation', id: 'o' },
    sql`1`,
  )
  expect(last.entries[0].changes).toEqual([
    expect.objectContaining({ path: ['subject'], after: { present: false } }),
  ])
})
