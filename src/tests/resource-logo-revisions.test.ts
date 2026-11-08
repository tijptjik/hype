// @vitest-environment node
import { readFileSync } from 'node:fs'
import { getTableColumns, getTableName, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { publicationSqlite } from './fixtures/publicationSqlite'
import * as schema from '#lib/db/schema/index.js'
import {
  enrollResourceLogo,
  prepareResourceLogoRevision,
  readResourceLogoHead,
} from '#lib/db/services/resourceLogoRevision.js'
import { prepareOrganisationRevisionCapture } from '#lib/db/services/organisationRevision.js'
import {
  createUploadedResourceImage,
  getResourceUploadSnapshot,
} from '#lib/db/services/resourceImageUpload.js'
import { ImageInsertWithProjectOrOrganisationAPI } from '#lib/db/zod/schema/image.js'
import { readImageRevisionDelivery } from '#lib/db/services/imageRevisionDelivery.js'
import { historicalLogo } from '#lib/db/services/resourceHistory.js'
import type { Database } from '#lib/types.js'
let fixture: ReturnType<typeof publicationSqlite<typeof schema>>
let db: Database
beforeEach(() => {
  fixture = publicationSqlite(schema)
  db = fixture.db as unknown as Database
  const { sqlite } = fixture
  sqlite.exec('PRAGMA foreign_keys=ON')
  for (const table of [
    schema.user,
    schema.organisationI18n,
    schema.organisationProperty,
    schema.organisationUserPolicy,
    schema.organisation,
    schema.feature,
    schema.image,
    schema.featureImage,
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
  sqlite.exec(readFileSync('migrations/0173_organisation_revisions.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0177_admin_resource_revisions.sql', 'utf8'))
  sqlite.exec('UPDATE adminResourceRevisionRollout SET enabled=1')
  sqlite.exec(
    'CREATE TABLE featureRevision(id TEXT PRIMARY KEY,content TEXT,featureId TEXT); CREATE TABLE featureRevisionHead(featureId TEXT,publishedRevisionId TEXT,state TEXT)',
  )
  sqlite.exec(readFileSync('migrations/0172_image_revisions.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0197_resource_logo_revisions.sql', 'utf8'))
  sqlite.exec(`INSERT INTO image(id,publicId,env,version,isArchived) VALUES('logo','logos/original','local',1,0);
    UPDATE organisation SET imageId='logo',modifiedAt='old' WHERE id='org';
    UPDATE project SET imageId='logo' WHERE id='p';
    UPDATE hub SET imageId='logo' WHERE id='h';
    INSERT INTO revisionChangeSet VALUES('baseline','editor','user','baseline','today');
    INSERT INTO imageAssetVersion VALUES('asset','logo','local','logos/original','${'a'.repeat(64)}','image/png',10,'baseline');
    INSERT INTO imageRevision VALUES('original','logo',NULL,'asset','baseline','{"version":1,"presentationMode":"contain"}');`)
})
afterEach(() => fixture.sqlite.close())

async function enroll() {
  expect(
    await enrollResourceLogo(db, {
      imageId: 'logo',
      imageRevisionId: 'original',
      actorId: 'editor',
      guard: sql`1`,
    }),
  ).toBe(true)
}
async function edit(version: number, fail = false, replacement = false) {
  const head = (await readResourceLogoHead(db, 'logo'))!
  const asset = replacement
    ? { ...head.asset, storageKey: 'logos/replaced', contentHash: 'b'.repeat(64) }
    : head.asset
  const capture = await prepareResourceLogoRevision(db, {
    imageId: 'logo',
    actorId: 'editor',
    reason: 'Logo edited',
    expectedRevisionId: head.imageRevisionId,
    asset,
    metadata: { version, presentationMode: 'contain', credit: 'New credit' },
  })
  await db.batch([
    ...capture.before,
    db
      .update(schema.image)
      .set({ version, publicId: asset.storageKey })
      .where(sql`id='logo'`),
    ...capture.after,
    ...(fail ? [db.run(sql`SELECT json('bad')`)] : []),
  ] as never)
}
describe('exact resource logo history', () => {
  it('enrolls all shared owners without rewriting legacy history or edit tokens', async () => {
    await enroll()
    for (const resource of ['organisation', 'project', 'hub']) {
      const rows = fixture.sqlite
        .prepare(`SELECT content FROM ${resource}Revision ORDER BY rowid`)
        .all()
      expect(rows).toHaveLength(2)
      expect(JSON.parse(rows[0].content as string).logo).toBeUndefined()
      expect(JSON.parse(rows[1].content as string).logo.imageRevisionId).toBe(
        'original',
      )
      expect(
        fixture.sqlite.prepare(`SELECT modifiedAt FROM ${resource}`).get()?.modifiedAt,
      ).toBe('old')
    }
  })
  it('records shared metadata edits and file replacements with retained original evidence', async () => {
    await enroll()
    await edit(2)
    await edit(3, false, true)
    for (const resource of ['organisation', 'project', 'hub'])
      expect(
        fixture.sqlite.prepare(`SELECT count(*) n FROM ${resource}RevisionLogo`).get()
          ?.n,
      ).toBe(3)
    expect(
      fixture.sqlite.prepare('SELECT count(*) n FROM imageAssetVersion').get()?.n,
    ).toBe(2)
    expect(
      fixture.sqlite
        .prepare("SELECT storageKey FROM imageAssetVersion WHERE id='asset'")
        .get()?.storageKey,
    ).toBe('logos/original')
    expect((await readResourceLogoHead(db, 'logo'))?.metadata).toMatchObject({
      version: 3,
    })
  })
  it('rolls back all shared resource snapshots and the image head after a late failure', async () => {
    await enroll()
    await expect(edit(2, true)).rejects.toThrow()
    expect((await readResourceLogoHead(db, 'logo'))?.imageRevisionId).toBe('original')
    expect(fixture.sqlite.prepare('SELECT version FROM image').get()?.version).toBe(1)
    for (const resource of ['organisation', 'project', 'hub'])
      expect(
        fixture.sqlite.prepare(`SELECT count(*) n FROM ${resource}RevisionLogo`).get()
          ?.n,
      ).toBe(1)
  })
  it('rejects stale edits and unscoped projection mutation', async () => {
    await enroll()
    const head = (await readResourceLogoHead(db, 'logo'))!
    await expect(
      prepareResourceLogoRevision(db, {
        ...head,
        imageId: 'logo',
        actorId: 'editor',
        reason: 'stale',
        expectedRevisionId: 'wrong',
      }),
    ).rejects.toThrow('STALE_LOGO_REVISION')
    expect(() =>
      fixture.sqlite.exec("UPDATE image SET version=9 WHERE id='logo'"),
    ).toThrow()
    expect(() => fixture.sqlite.exec('DELETE FROM resourceLogoImageHead')).toThrow()
    expect(() => fixture.sqlite.exec('DELETE FROM projectRevisionLogo')).toThrow()
  })
  it('retains exact historical evidence when a logo is detached', async () => {
    await enroll()
    const capture = await prepareOrganisationRevisionCapture(db, sql`SELECT 'org' id`, {
      actorId: 'editor',
    })
    await db.batch([
      ...capture.before,
      db.update(schema.organisation).set({ imageId: null }).where(sql`id='org'`),
      ...capture.after,
    ] as never)
    expect(
      fixture.sqlite.prepare('SELECT count(*) n FROM organisationRevisionLogo').get()
        ?.n,
    ).toBe(1)
    expect(await readResourceLogoHead(db, 'logo')).not.toBeNull()
  })
  it('pins a verified upload atomically and preserves its revision on retry', async () => {
    await enroll()
    const before = (await getResourceUploadSnapshot(db, 'project', 'p'))!
    const data = ImageInsertWithProjectOrOrganisationAPI.parse({
      publicId: 'new/logo',
      env: 'local',
      cdn: 'cloudflareR2',
      contributorId: 'editor',
      ctxType: 'project',
      ctxId: 'p',
      version: 10,
    })
    const evidence = {
      asset: {
        storageNamespace: 'local',
        storageKey: 'new/logo',
        contentHash: 'c'.repeat(64),
        byteSize: 20,
        mediaType: 'image/png',
      },
      metadata: { version: 10, presentationMode: 'contain' },
    }
    const first = await createUploadedResourceImage(
      db,
      'project',
      'p',
      data,
      before,
      undefined,
      { actorId: 'editor' },
      evidence,
    )
    expect(first).not.toBeNull()
    const head = await readResourceLogoHead(db, first!.id)
    const replay = await createUploadedResourceImage(
      db,
      'project',
      'p',
      data,
      before,
      undefined,
      { actorId: 'editor' },
      evidence,
    )
    expect(replay?.id).toBe(first!.id)
    expect(await readResourceLogoHead(db, first!.id)).toEqual(head)
  })
  it('rejects different bytes at an already retained object key', async () => {
    await enroll()
    const head = (await readResourceLogoHead(db, 'logo'))!
    await expect(
      prepareResourceLogoRevision(db, {
        ...head,
        imageId: 'logo',
        actorId: 'editor',
        reason: 'invalid',
        asset: { ...head.asset, contentHash: 'c'.repeat(64) },
      }),
    ).rejects.toThrow('different immutable evidence')
  })
  it('public delivery follows only the current logo pin and honors moderation', async () => {
    fixture.sqlite.exec(
      "UPDATE organisation SET isPublished=1,isArchived=0 WHERE id='org'",
    )
    await enroll()
    expect(await readImageRevisionDelivery(db, 'original')).not.toBeNull()
    await edit(2)
    expect(await readImageRevisionDelivery(db, 'original')).toBeNull()
    const head = (await readResourceLogoHead(db, 'logo'))!
    expect(await readImageRevisionDelivery(db, head.imageRevisionId)).not.toBeNull()
    fixture.sqlite.exec("UPDATE image SET isArchived=1 WHERE id='logo'")
    expect(await readImageRevisionDelivery(db, head.imageRevisionId, sql`1`)).toBeNull()
  })
  it('refuses logo enrollment if a shared owner has recording disabled', async () => {
    fixture.sqlite.exec(
      "UPDATE adminResourceRevisionRollout SET enabled=0 WHERE resource='project'",
    )
    await expect(
      enrollResourceLogo(db, {
        imageId: 'logo',
        imageRevisionId: 'original',
        actorId: 'editor',
        guard: sql`1`,
      }),
    ).rejects.toThrow('project revision recording')
    expect(await readResourceLogoHead(db, 'logo')).toBeNull()
  })
  it('never resolves an unpinned historical identity to current bytes', () => {
    expect(historicalLogo('{"record":{"imageId":"logo"}}')).toEqual({
      imageId: 'logo',
      imageRevisionId: null,
    })
  })
})

describe('hub Cast Edges data migration', () => {
  it('advances enrolled shared logo heads while retaining exact historical pins and bytes', async () => {
    await enroll()
    const { sqlite } = fixture
    const before = Object.fromEntries(
      ['hub', 'project', 'organisation'].map(kind => [
        kind,
        sqlite.prepare(`SELECT * FROM ${kind}Revision ORDER BY id`).all(),
      ]),
    )
    const assets = sqlite.prepare('SELECT * FROM imageAssetVersion').all()
    const migration = readFileSync('migrations/0198_hub_image_cast_edges.sql', 'utf8')
    sqlite.exec(`BEGIN; ${migration} COMMIT;`)
    expect((await readResourceLogoHead(db, 'logo'))?.metadata).toMatchObject({
      presentationMode: 'cast-edges',
      version: 1,
    })
    expect(
      sqlite.prepare("SELECT presentationMode FROM image WHERE id='logo'").get(),
    ).toEqual({ presentationMode: 'cast-edges' })
    expect(
      sqlite.prepare("SELECT metadata FROM imageRevision WHERE id='original'").get(),
    ).toEqual({ metadata: '{"version":1,"presentationMode":"contain"}' })
    expect(sqlite.prepare('SELECT * FROM imageAssetVersion').all()).toEqual(assets)
    for (const kind of ['hub', 'project', 'organisation']) {
      const rows = sqlite.prepare(`SELECT * FROM ${kind}Revision ORDER BY id`).all()
      for (const old of before[kind]) expect(rows).toContainEqual(old)
      expect(rows).toHaveLength(before[kind].length + 1)
      const head = sqlite
        .prepare(
          `SELECT r.content FROM ${kind}RevisionHead h JOIN ${kind}Revision r ON r.id=h.currentRevisionId`,
        )
        .get() as { content: string }
      expect(JSON.parse(head.content).logo.imageRevisionId).toBe(
        'migration-0198-image-logo',
      )
      expect(sqlite.prepare(`SELECT * FROM ${kind}RevisionWrite`).all()).toEqual([])
    }
    const count = sqlite.prepare('SELECT count(*) AS n FROM imageRevision').get()
    sqlite.exec(`BEGIN; ${migration} COMMIT;`)
    expect(sqlite.prepare('SELECT count(*) AS n FROM imageRevision').get()).toEqual(
      count,
    )
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('updates legacy and archived hub images without enrolling them or touching unrelated images', () => {
    const { sqlite } = fixture
    sqlite.exec(`INSERT INTO image(id,publicId,presentationMode,isArchived) VALUES
      ('unrelated','unrelated','cover',0),('archived','archived','cover',1);
      INSERT INTO hub(id,imageId) VALUES('archived-hub','archived'),('empty-hub',NULL);`)
    const migration = readFileSync('migrations/0198_hub_image_cast_edges.sql', 'utf8')
    sqlite.exec(`BEGIN; ${migration} COMMIT;`)
    expect(
      sqlite.prepare('SELECT id,presentationMode FROM image ORDER BY id').all(),
    ).toEqual([
      { id: 'archived', presentationMode: 'cast-edges' },
      { id: 'logo', presentationMode: 'cast-edges' },
      { id: 'unrelated', presentationMode: 'cover' },
    ])
    expect(sqlite.prepare('SELECT * FROM resourceLogoImageHead').all()).toEqual([])
    expect(sqlite.prepare('SELECT * FROM hubRevision').all()).toEqual([])
    sqlite.exec(`BEGIN; ${migration} COMMIT;`)
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
})
