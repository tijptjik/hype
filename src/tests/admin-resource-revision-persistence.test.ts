// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// DRIZZLE
import { getTableColumns, getTableName, sql } from 'drizzle-orm'
// TESTS
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { publicationSqlite } from './fixtures/publicationSqlite'
// SCHEMA
import * as schema from '#lib/db/schema/index.js'
// SERVICES
import { removeAdminResourceImage } from '#lib/db/services/adminResourceImage.js'
import { organisationImageDeletionGuard } from '#lib/db/services/organisationImage.js'
import {
  createUploadedResourceImage,
  getResourceUploadSnapshot,
} from '#lib/db/services/resourceImageUpload.js'
import { createDefaultProjectLicense } from '#lib/db/services/licence.js'
import {
  prepareAdminResourceRevisionCapture,
  listAdminResourceHistory,
  hasAdminResourceRevisionStorage,
} from '#lib/db/services/adminResourceRevision.js'
import { executeRevisionBatch } from '#lib/db/services/revisionBatch.js'
import {
  createHub,
  updateHubPublishedStateById,
  updateHubArchivedStateById,
  updateHubByIdWithConcurrency,
} from '#lib/db/services/hub.js'
import {
  createLayer,
  updateLayerPublishedStateById,
  updateLayerArchivedStateById,
  updateLayerByIdWithConcurrency,
} from '#lib/db/services/layer.js'
import {
  createProject,
  updateProjectPublishedStateById,
  updateProjectArchivedStateById,
  updateProjectByIdWithConcurrency,
} from '#lib/db/services/project.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { AdminRevisionResource } from '#lib/db/services/adminResourceRevision.js'

let fixture: ReturnType<typeof publicationSqlite<typeof schema>>
let db: Database
beforeEach(() => {
  fixture = publicationSqlite(schema)
  db = fixture.db as unknown as Database
  const { sqlite } = fixture
  sqlite.exec('PRAGMA foreign_keys=ON')
  for (const table of [
    schema.user,
    schema.organisation,
    schema.feature,
    schema.image,
    schema.featureImage,
    schema.task,
    schema.taskImage,
    schema.hub,
    schema.project,
    schema.layer,
    schema.hubI18n,
    schema.projectI18n,
    schema.layerI18n,
    schema.hubProperty,
    schema.projectProperty,
    schema.layerProperty,
    schema.hubLayer,
    schema.projectMapStyles,
  ]) {
    const columns = Object.values(getTableColumns(table)).map(
      column =>
        `"${column.name}" ${column.getSQLType()}${column.name === 'id' ? ' PRIMARY KEY' : ''}`,
    )
    sqlite.exec(`CREATE TABLE "${getTableName(table)}" (${columns.join(',')})`)
  }
  sqlite.exec(`CREATE TABLE revisionChangeSet(id TEXT PRIMARY KEY,actorId TEXT,origin TEXT,reason TEXT,createdAt TEXT);
    INSERT INTO organisation(id,hubId,isArchived) VALUES ('org','h',0);
    INSERT INTO hub(id,code,modifiedAt,subscriptionSessionCookie) VALUES ('h','hub','old','private-cookie');
    INSERT INTO project(id,code,organisationId,modifiedAt) VALUES ('p','project','org','old');
    INSERT INTO layer(id,projectId,organisationId,modifiedAt) VALUES ('l','p','org','old');`)
  sqlite.exec(readFileSync('migrations/0177_admin_resource_revisions.sql', 'utf8'))
  sqlite.exec('UPDATE adminResourceRevisionRollout SET enabled=1')
})
afterEach(() => fixture.sqlite.close())

const ids = { hub: 'h', project: 'p', layer: 'l' } as const
/**
 * Executes a test mutation inside the production capture boundary.
 * @param resource Tested resource type.
 * @param value New authored value.
 * @param fail Whether to inject a late failure.
 * @returns Completion after the real SQLite batch commits or rolls back.
 */
async function edit(
  resource: AdminRevisionResource,
  value: string,
  fail = false,
): Promise<void> {
  const capture = await prepareAdminResourceRevisionCapture(
    db,
    resource,
    sql`SELECT ${ids[resource]} AS id`,
    { actorId: 'editor' },
  )
  const table = schema[resource]
  const mutation =
    resource === 'layer'
      ? db
          .update(schema.layer)
          .set({ metadata: { revisionTestValue: value } })
          .where(sql`id=${ids[resource]}`)
      : resource === 'project'
        ? db.update(schema.project).set({ code: value }).where(sql`id=${ids[resource]}`)
        : db.update(schema.hub).set({ code: value }).where(sql`id=${ids[resource]}`)
  await db.batch([
    ...capture.before,
    mutation,
    ...capture.after,
    ...(fail ? [db.select({ invalid: sql`json('invalid')` }).from(table)] : []),
  ] as never)
}

describe.each(['project', 'layer', 'hub'] as const)(
  '%s immutable admin capture',
  resource => {
    it('preserves an unknown-author baseline and an attributed new head; no-op does not append', async () => {
      await edit(resource, 'changed')
      await edit(resource, 'changed')
      const rows = fixture.sqlite
        .prepare(
          `SELECT r.content,c.actorId FROM ${resource}Revision r JOIN revisionChangeSet c ON c.id=r.changeSetId ORDER BY r.rowid`,
        )
        .all()
      expect(rows).toHaveLength(2)
      expect(rows[0].actorId).toBe(`system:${resource}-revision-baseline`)
      expect(rows[1].actorId).toBe('editor')
      expect(
        fixture.sqlite
          .prepare(`SELECT count(*) AS n FROM ${resource}RevisionWrite`)
          .get()?.n,
      ).toBe(0)
      if (resource === 'hub')
        expect(JSON.stringify(rows)).not.toContain('private-cookie')
    })
    it('rolls back the projection, baseline and head after a late failure', async () => {
      await expect(edit(resource, 'failed', true)).rejects.toThrow()
      expect(
        fixture.sqlite.prepare(`SELECT count(*) AS n FROM ${resource}Revision`).get()
          ?.n,
      ).toBe(0)
      expect(
        fixture.sqlite
          .prepare(`SELECT modifiedAt FROM ${resource} WHERE id=?`)
          .get(ids[resource])?.modifiedAt,
      ).toBe('old')
    })
    it('rejects direct projection changes and immutable revision rewrites', async () => {
      await edit(resource, 'changed')
      expect(() =>
        fixture.sqlite.exec(`UPDATE ${resource} SET modifiedAt='bypass'`),
      ).toThrow('requires revision capture')
      expect(() =>
        fixture.sqlite.exec(`UPDATE ${resource}Revision SET content='{}'`),
      ).toThrow('immutable')
      expect(() => fixture.sqlite.exec(`DELETE FROM ${resource}Revision`)).toThrow(
        'immutable',
      )
    })
    it('does not enroll a stale command', async () => {
      const capture = await prepareAdminResourceRevisionCapture(
        db,
        resource,
        sql`SELECT ${ids[resource]} AS id`,
        { actorId: 'editor' },
      )
      expect(
        await executeRevisionBatch(db, sql`0`, [...capture.before, ...capture.after]),
      ).toBeNull()
      expect(
        fixture.sqlite.prepare(`SELECT count(*) AS n FROM ${resource}Revision`).get()
          ?.n,
      ).toBe(0)
    })
    it('fails closed when only part of the storage is installed', async () => {
      fixture.sqlite.exec(`DROP TABLE ${resource}RevisionWrite`)
      await expect(hasAdminResourceRevisionStorage(db, resource)).rejects.toThrow(
        'Incomplete',
      )
    })
  },
)

it('uses the existing hub form transaction and rejects its stale replay', async () => {
  const params = {
    id: 'h',
    actorId: 'admin',
    updatedAt: 'old',
    data: {
      code: 'new-hub',
      domain: null,
      legalContactAddress: null,
      subscriptionService: null,
      subscriptionId: null,
      subscriptionSessionCookie: 'new-secret',
      subscriptionPlacement: { hubPanel: false, topBar: false, menu: true },
    },
  }
  expect(await updateHubByIdWithConcurrency(db, params as never)).toMatchObject({
    id: 'h',
  })
  expect(await updateHubByIdWithConcurrency(db, params as never)).toBeNull()
  expect(fixture.sqlite.prepare('SELECT count(*) AS n FROM hubRevision').get()?.n).toBe(
    2,
  )
})
it('uses the existing layer form transaction', async () => {
  expect(
    await updateLayerByIdWithConcurrency(db, {
      id: 'l',
      actorId: 'admin',
      updatedAt: 'old',
      data: { organisationId: 'org', projectId: 'p', isDefaultVisible: true },
    } as never),
  ).toMatchObject({ id: 'l' })
  expect(
    fixture.sqlite.prepare('SELECT count(*) AS n FROM layerRevision').get()?.n,
  ).toBe(2)
})
it('captures layer ordering changes made by the existing project form', async () => {
  expect(
    await updateProjectByIdWithConcurrency(db, {
      id: 'p',
      actorId: 'admin',
      updatedAt: 'old',
      data: { organisationId: 'org', code: 'new-project' },
      layers: [{ id: 'l', rank: 4, isDefaultVisible: true }],
    } as never),
  ).toMatchObject({ id: 'p' })
  const row = fixture.sqlite
    .prepare('SELECT content FROM layerRevision ORDER BY rowid DESC LIMIT 1')
    .get()
  expect(JSON.parse(row!.content as string).record.rank).toBe(4)
  expect(
    fixture.sqlite.prepare('SELECT count(*) AS n FROM projectRevision').get()?.n,
  ).toBe(2)
})

it.each(['project', 'layer', 'hub'] as const)(
  'creates an attributed %s root without an invented baseline',
  async resource => {
    const actor = { actorId: 'creator' }
    if (resource === 'hub')
      await createHub(db, { id: 'new', code: 'new' }, undefined, actor)
    if (resource === 'project')
      await createProject(
        db,
        {
          id: 'new',
          code: 'new',
          organisationId: 'org',
          settings: {},
          flags: {},
          cardStyleCode: null,
          markerStyleCode: null,
          capabilities: {
            manageBakeries: false,
            manageVolunteers: false,
            manageDropOffs: false,
          },
          license: createDefaultProjectLicense(),
        },
        undefined,
        actor,
      )
    if (resource === 'layer')
      await createLayer(
        db,
        { id: 'new', projectId: 'p', organisationId: 'org', metadata: {} },
        undefined,
        actor,
      )
    const rows = fixture.sqlite
      .prepare(
        `SELECT r.previousRevisionId,c.actorId FROM ${resource}Revision r JOIN revisionChangeSet c ON c.id=r.changeSetId WHERE r.${resource}Id='new'`,
      )
      .all()
    expect(rows).toEqual([{ previousRevisionId: null, actorId: 'creator' }])
  },
)

it.each(['project', 'layer', 'hub'] as const)(
  'captures %s publish and archive state commands',
  async resource => {
    const params = {
      id: ids[resource],
      actorId: 'admin',
      publisherId: 'admin',
      state: true,
      expectedScope: { organisationId: 'org', projectId: 'p', hubId: 'h' },
    }
    const publish = {
      hub: updateHubPublishedStateById,
      project: updateProjectPublishedStateById,
      layer: updateLayerPublishedStateById,
    }[resource]
    const archive = {
      hub: updateHubArchivedStateById,
      project: updateProjectArchivedStateById,
      layer: updateLayerArchivedStateById,
    }[resource]
    expect(await publish(db, params as never)).toMatchObject({ isPublished: true })
    expect(await archive(db, params as never)).toMatchObject({ isArchived: true })
    expect(
      fixture.sqlite.prepare(`SELECT count(*) AS n FROM ${resource}Revision`).get()?.n,
    ).toBe(3)
    const latest = fixture.sqlite
      .prepare(`SELECT content FROM ${resource}Revision ORDER BY rowid DESC LIMIT 1`)
      .get()
    expect(JSON.parse(latest!.content as string).record).toMatchObject({
      isPublished: true,
      isArchived: true,
    })
  },
)

it('rolls back a published project and descendant history if a late revision insert fails', async () => {
  fixture.sqlite.exec(
    `CREATE TRIGGER fail_layer_history BEFORE INSERT ON layerRevision WHEN NEW.previousRevisionId IS NOT NULL BEGIN SELECT RAISE(ABORT,'late history failure'); END`,
  )
  await expect(
    updateProjectPublishedStateById(db, {
      id: 'p',
      publisherId: 'admin',
      state: true,
      publishChildren: true,
      expectedScope: { organisationId: 'org', hubId: 'h' },
    } as never),
  ).rejects.toThrow()
  expect(
    fixture.sqlite.prepare('SELECT count(*) AS n FROM projectRevision').get()?.n,
  ).toBe(0)
  expect(
    fixture.sqlite.prepare('SELECT count(*) AS n FROM layerRevision').get()?.n,
  ).toBe(0)
  expect(
    fixture.sqlite.prepare("SELECT isPublished FROM project WHERE id='p'").get()
      ?.isPublished,
  ).toBeNull()
})

it('rolls back form history when the parent update is skipped by a database trigger', async () => {
  fixture.sqlite.exec(
    `CREATE TRIGGER ignore_hub_update BEFORE UPDATE ON hub BEGIN SELECT RAISE(IGNORE); END`,
  )
  expect(
    await updateHubByIdWithConcurrency(db, {
      id: 'h',
      actorId: 'admin',
      updatedAt: 'old',
      data: { code: 'ignored' },
    } as never),
  ).toBeNull()
  expect(fixture.sqlite.prepare('SELECT count(*) AS n FROM hubRevision').get()?.n).toBe(
    0,
  )
  expect(
    fixture.sqlite.prepare('SELECT count(*) AS n FROM revisionChangeSet').get()?.n,
  ).toBe(0)
})

it('rejects cross-identity predecessors and current heads', async () => {
  await edit('hub', 'changed')
  fixture.sqlite.exec("INSERT INTO hub(id,code) VALUES ('other','other')")
  const row = fixture.sqlite
    .prepare('SELECT id,changeSetId FROM hubRevision LIMIT 1')
    .get()!
  expect(() =>
    fixture.sqlite
      .prepare(
        "INSERT INTO hubRevision(id,hubId,previousRevisionId,changeSetId,content) VALUES ('bad','other',?,?, '{}')",
      )
      .run(row.id as string, row.changeSetId as string),
  ).toThrow('predecessor missing')
  expect(() =>
    fixture.sqlite
      .prepare(
        "INSERT INTO hubRevisionHead(hubId,currentRevisionId) VALUES ('other',?)",
      )
      .run(row.id as string),
  ).toThrow('FOREIGN KEY')
})

it.each(['hub', 'project', 'layer'] as const)(
  'reads %s history with predecessor diffs and current ancestry fencing',
  async resource => {
    fixture.sqlite.exec(
      "INSERT INTO user(id,name,username,displayUsername,image) VALUES ('editor','History Editor','history.editor','History.Editor','/avatar.png')",
    )
    await edit(resource, 'changed')
    const input = {
      resource,
      id: ids[resource],
      organisationId: 'org',
      projectId: 'p',
      hubId: 'h',
    }
    const history = await listAdminResourceHistory(db, input)
    expect(history.entries).toHaveLength(2)
    expect(history.entries[0].changes.length).toBeGreaterThan(0)
    expect(history.entries[1].initial).toBe(true)
    expect(history.entries[0].actor).toEqual({
      name: 'History Editor',
      username: 'history.editor',
      displayUsername: 'History.Editor',
      image: '/avatar.png',
    })
    expect(history.entries[1].actor).toBeNull()
    fixture.sqlite.exec("DELETE FROM user WHERE id='editor'")
    const deletedActorHistory = await listAdminResourceHistory(db, input)
    expect(deletedActorHistory.entries).toHaveLength(2)
    expect(deletedActorHistory.entries[0]).toMatchObject({
      actorId: 'editor',
      actor: null,
    })
    if (resource !== 'hub') {
      expect(
        (await listAdminResourceHistory(db, { ...input, hubId: 'wrong' })).entries,
      ).toEqual([])
      expect(
        (await listAdminResourceHistory(db, { ...input, organisationId: 'wrong' }))
          .entries,
      ).toEqual([])
    }
    if (resource === 'layer')
      expect(
        (await listAdminResourceHistory(db, { ...input, projectId: 'wrong' })).entries,
      ).toEqual([])
  },
)

it('paginates history without losing the actual predecessor comparison', async () => {
  for (let i = 0; i < 12; i++) await edit('hub', `edit-${i}`)
  const first = await listAdminResourceHistory(db, { resource: 'hub', id: 'h' })
  const last = await listAdminResourceHistory(db, {
    resource: 'hub',
    id: 'h',
    before: first.nextCursor!,
  })
  expect(first.entries).toHaveLength(10)
  expect(first.entries[9].initial).toBe(false)
  expect(last.entries).toHaveLength(3)
  expect(last.nextCursor).toBeNull()
  expect(new Set([...first.entries, ...last.entries].map(row => row.id)).size).toBe(13)
})

it('keeps storage readable without enrolling live edits while capture is disabled', async () => {
  fixture.sqlite.exec('UPDATE adminResourceRevisionRollout SET enabled=0')
  expect(await hasAdminResourceRevisionStorage(db, 'hub')).toBe(true)
  const capture = await prepareAdminResourceRevisionCapture(
    db,
    'hub',
    sql`SELECT 'h' AS id`,
    { actorId: 'admin' },
  )
  expect(capture).toEqual({ before: [], after: [] })
  await updateHubByIdWithConcurrency(db, {
    id: 'h',
    actorId: 'admin',
    updatedAt: 'old',
    data: { code: 'editable' },
  } as never)
  expect(
    fixture.sqlite.prepare('SELECT count(*) AS n FROM hubRevisionHead').get()?.n,
  ).toBe(0)
  expect(
    (await listAdminResourceHistory(db, { resource: 'hub', id: 'h' })).available,
  ).toBe(true)
})

it('does not allow disabling capture to bypass guards on enrolled records', async () => {
  await edit('hub', 'enrolled')
  fixture.sqlite.exec('UPDATE adminResourceRevisionRollout SET enabled=0')
  expect(() =>
    fixture.sqlite.exec("UPDATE hub SET code='bypass' WHERE id='h'"),
  ).toThrow('requires revision capture')
})

it('composes overlapping capture scopes without extra revisions or lost final changes', async () => {
  const outer = await prepareAdminResourceRevisionCapture(
    db,
    'hub',
    sql`SELECT 'h' AS id`,
    { actorId: 'outer' },
  )
  const inner = await prepareAdminResourceRevisionCapture(
    db,
    'hub',
    sql`SELECT 'h' AS id`,
    { actorId: 'inner' },
  )
  await db.batch([
    ...outer.before,
    ...inner.before,
    db.update(schema.hub).set({ code: 'inner edit' }),
    ...inner.after,
    db.update(schema.hub).set({ domain: 'example.test' }),
    ...outer.after,
  ] as never)
  expect(fixture.sqlite.prepare('SELECT count(*) n FROM hubRevision').get()?.n).toBe(2)
  const final = fixture.sqlite
    .prepare('SELECT content FROM hubRevision ORDER BY rowid DESC LIMIT 1')
    .get()!
  expect(JSON.parse(final.content as string).record).toMatchObject({
    code: 'inner edit',
    domain: 'example.test',
  })
  expect(
    fixture.sqlite.prepare('SELECT count(*) n FROM hubRevisionWrite').get()?.n,
  ).toBe(0)
})

it.each(['project', 'hub'] as const)(
  'retains %s logo history when its current image is removed',
  async resource => {
    fixture.sqlite.exec(
      `INSERT INTO image(id) VALUES ('logo'); UPDATE ${resource} SET imageId='logo' WHERE id='${ids[resource]}'`,
    )
    await edit(resource, 'enrolled')
    expect(
      await removeAdminResourceImage(db, {
        resource,
        resourceId: ids[resource],
        imageId: 'logo',
        actor: { actorId: 'admin' },
        guard: sql`1`,
      }),
    ).toBe(true)
    expect(
      fixture.sqlite
        .prepare(`SELECT imageId FROM ${resource} WHERE id=?`)
        .get(ids[resource])?.imageId,
    ).toBeNull()
    expect(
      fixture.sqlite.prepare("SELECT id FROM image WHERE id='logo'").get(),
    ).toBeTruthy()
    const guard = await organisationImageDeletionGuard(db, 'logo')
    expect(
      (await db.select({ allowed: guard }).from(sql`(SELECT 1)`).get())?.allowed,
    ).toBe(0)
    expect(
      await removeAdminResourceImage(db, {
        resource,
        resourceId: ids[resource],
        imageId: 'logo',
        actor: { actorId: 'admin' },
        guard: sql`1`,
      }),
    ).toBe(false)
  },
)

it.each(['project', 'hub'] as const)(
  'records one %s logo upload revision and no additional revision on retry',
  async resource => {
    const expected = await getResourceUploadSnapshot(db, resource, ids[resource])
    const data = { publicId: 'object', env: 'local', isArchived: false } as never
    expect(
      await createUploadedResourceImage(
        db,
        resource,
        ids[resource],
        data,
        expected!,
        'uploaded',
        { actorId: 'uploader' },
      ),
    ).toBeTruthy()
    const before = fixture.sqlite
      .prepare(`SELECT count(*) n FROM ${resource}Revision`)
      .get()?.n
    expect(before).toBe(2)
    expect(
      await createUploadedResourceImage(
        db,
        resource,
        ids[resource],
        data,
        expected!,
        'uploaded',
        { actorId: 'uploader' },
      ),
    ).toBeTruthy()
    expect(
      fixture.sqlite.prepare(`SELECT count(*) n FROM ${resource}Revision`).get()?.n,
    ).toBe(before)
  },
)
