// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { afterEach, describe, expect, it } from 'vitest'
// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import { DEFAULT_IMAGE_INTENTS, resolveImageIntent } from '#lib/images/intents.js'
// SERVICES
import {
  readImageRevisionDelivery,
  readImageRevisionAddress,
  verifyImageRevisionBytes,
} from '#lib/db/services/imageRevisionDelivery.js'
import { createImageAssetRevision } from '#lib/db/services/imageRevision.js'
import {
  initializeFeatureRevision,
  createFeatureRevisionProposal,
} from '#lib/db/services/featureRevision.js'
// FIXTURES
import { publicationSqlite } from './fixtures/publicationSqlite'
// TYPES
import type { Database } from '#lib/types.js'

const connections: ReturnType<typeof publicationSqlite>[] = []
afterEach(() => {
  for (const connection of connections.splice(0)) connection.sqlite.close()
})

/** Create gallery pins with real revision FK/immutability triggers.
 * @param assignment Effective intent and publication setting from the owner policy.
 * @returns Database fixture with its exact accepted image revision.
 */
async function fixture(assignment = { intent: 'general', isPublished: true }) {
  const connection = publicationSqlite({})
  connections.push(connection)
  const { sqlite } = connection,
    db = connection.db as unknown as Database
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE organisation(id TEXT PRIMARY KEY,isPublished INTEGER,isArchived INTEGER);
    CREATE TABLE project(id TEXT PRIMARY KEY,organisationId TEXT,isPublished INTEGER,isArchived INTEGER);
    CREATE TABLE layer(id TEXT PRIMARY KEY,projectId TEXT,isPublished INTEGER,isArchived INTEGER);
    CREATE TABLE feature(id TEXT PRIMARY KEY,layerId TEXT,projectId TEXT,organisationId TEXT,isPublished INTEGER,isArchived INTEGER,isDraft INTEGER);
    CREATE TABLE image(id TEXT PRIMARY KEY,isArchived INTEGER);
    CREATE TABLE featureImage(featureId TEXT,imageId TEXT,isPublished INTEGER,intent TEXT);
    INSERT INTO organisation VALUES ('o',1,0); INSERT INTO project VALUES ('p','o',1,0);
    INSERT INTO layer VALUES ('l','p',1,0); INSERT INTO feature VALUES ('f','l','p','o',1,0,0);
    INSERT INTO image VALUES ('photo',0); INSERT INTO featureImage VALUES ('f','photo',1,'general');`)
  sqlite
    .prepare('UPDATE featureImage SET intent=?,isPublished=?')
    .run(assignment.intent, Number(assignment.isPublished))
  sqlite.exec(readFileSync('migrations/0171_feature_revisions.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0172_image_revisions.sql', 'utf8'))
  const common = { actorId: 'editor', guard: sql`1` }
  const asset = (await createImageAssetRevision(db, {
    ...common,
    imageId: 'photo',
    storageNamespace: 'local',
    storageKey: 'immutable/photo',
    contentHash: 'a'.repeat(64),
    mediaType: 'image/jpeg',
    byteSize: 12,
    metadata: { credit: 'Original', metadata: { private: 'EXIF' } },
  }))!
  const content = {
    gallery: {
      entries: {
        photo: {
          imageRevisionId: asset.imageRevisionId,
          ...assignment,
          caption: {},
          alt: {},
        },
      },
      order: ['photo'],
    },
  }
  const baseline = (await initializeFeatureRevision(db, {
    ...common,
    featureId: 'f',
    content,
    published: true,
  }))!
  return { ...connection, db, common, asset, content, baseline }
}

describe('exact image revision delivery', () => {
  it('resolves only the accepted pin, retaining its exact locator and metadata', async () => {
    const f = await fixture()
    expect(
      await readImageRevisionDelivery(f.db, f.asset.imageRevisionId),
    ).toMatchObject({
      storageNamespace: 'local',
      storageKey: 'immutable/photo',
      metadata: { credit: 'Original' },
    })
    const another = (await createImageAssetRevision(f.db, {
      ...f.common,
      imageId: 'photo',
      storageNamespace: 'local',
      storageKey: 'immutable/photo-new',
      contentHash: 'b'.repeat(64),
      mediaType: 'image/jpeg',
      byteSize: 14,
      metadata: { credit: 'Proposal only' },
    }))!
    const content = structuredClone(f.content)
    content.gallery.entries.photo.imageRevisionId = another.imageRevisionId
    await createFeatureRevisionProposal(f.db, {
      ...f.common,
      featureId: 'f',
      baseRevisionId: f.baseline,
      content,
    })
    expect(await readImageRevisionDelivery(f.db, another.imageRevisionId)).toBeNull()
    expect(
      (await readImageRevisionDelivery(f.db, f.asset.imageRevisionId))?.storageKey,
    ).toBe('immutable/photo')
  })

  it.each([
    'UPDATE image SET isArchived=1',
    'UPDATE feature SET isPublished=0',
    'UPDATE feature SET isDraft=1',
    'UPDATE featureImage SET isPublished=0',
    'UPDATE layer SET isPublished=0',
    'UPDATE project SET isArchived=1',
    'UPDATE organisation SET isPublished=0',
    "UPDATE layer SET projectId='elsewhere'",
  ])('enforces live visibility: %s', async change => {
    const f = await fixture()
    f.sqlite.exec(change)
    expect(await readImageRevisionDelivery(f.db, f.asset.imageRevisionId)).toBeNull()
  })

  it('keeps Research hidden under the default owner policy', async () => {
    const assignment = resolveImageIntent(DEFAULT_IMAGE_INTENTS, 'research')
    expect(assignment).toEqual({ intent: 'research', isPublished: false })
    const f = await fixture(assignment)
    expect(await readImageRevisionDelivery(f.db, f.asset.imageRevisionId)).toBeNull()
  })

  it('delivers Research when the owner enables publication, retaining live visibility guards', async () => {
    const intents = DEFAULT_IMAGE_INTENTS.map(intent =>
      intent.id === 'research' ? { ...intent, isPublished: true } : intent,
    )
    const assignment = resolveImageIntent(intents, 'research')
    expect(assignment).toEqual({ intent: 'research', isPublished: true })
    const f = await fixture(assignment)
    expect(
      await readImageRevisionDelivery(f.db, f.asset.imageRevisionId),
    ).toMatchObject({
      revisionId: f.asset.imageRevisionId,
      storageKey: 'immutable/photo',
    })
    f.sqlite.exec('UPDATE featureImage SET isPublished=0')
    expect(await readImageRevisionDelivery(f.db, f.asset.imageRevisionId)).toBeNull()
  })

  it('never lets a preview grant bypass image moderation', async () => {
    const f = await fixture()
    f.sqlite.exec('UPDATE feature SET isPublished=0')
    expect(
      await readImageRevisionDelivery(f.db, f.asset.imageRevisionId, sql`i.id='photo'`),
    ).not.toBeNull()
    f.sqlite.exec('UPDATE image SET isArchived=1')
    expect(
      await readImageRevisionDelivery(f.db, f.asset.imageRevisionId, sql`i.id='photo'`),
    ).toBeNull()
  })

  it('detects changed bytes even when object length is unchanged', async () => {
    const bytes = new TextEncoder().encode('abc').buffer
    const pin = {
      contentHash: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      byteSize: 3,
    }
    expect(await verifyImageRevisionBytes(pin, bytes)).toBe(true)
    expect(
      await verifyImageRevisionBytes(pin, new TextEncoder().encode('abd').buffer),
    ).toBe(false)
    expect(await verifyImageRevisionBytes({ ...pin, byteSize: 4 }, bytes)).toBe(false)
  })
})

describe('discovery-based image addresses', () => {
  it('delivers an exact known revision independently of publication and archive flags', async () => {
    const f = await fixture()
    f.sqlite.exec(
      'UPDATE feature SET isPublished=0,isArchived=1; UPDATE image SET isArchived=1; DELETE FROM featureImage;',
    )
    expect(await readImageRevisionAddress(f.db, f.asset.imageRevisionId)).toMatchObject(
      {
        revisionId: f.asset.imageRevisionId,
        storageKey: 'immutable/photo',
      },
    )
    expect(await readImageRevisionAddress(f.db, 'unknown-address')).toBeNull()
    // Permission-aware discovery callers keep their existing visibility rules.
    expect(await readImageRevisionDelivery(f.db, f.asset.imageRevisionId)).toBeNull()
  })
})
