// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { afterEach, describe, expect, it } from 'vitest'
// DRIZZLE
import { sql } from 'drizzle-orm'
// SERVICES
import {
  createImageAssetRevision,
  createImageMetadataRevision,
} from '#lib/db/services/imageRevision.js'
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
async function fixture() {
  const connection = publicationSqlite({})
  connections.push(connection)
  const { sqlite } = connection,
    db = connection.db as unknown as Database
  sqlite.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE feature(id TEXT PRIMARY KEY,isPublished INTEGER); CREATE TABLE image(id TEXT PRIMARY KEY); INSERT INTO feature VALUES ('f',1); INSERT INTO image VALUES ('a'),('b');",
  )
  sqlite.exec(readFileSync('migrations/0171_feature_revisions.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0172_image_revisions.sql', 'utf8'))
  const common = { actorId: 'editor', guard: sql`1` }
  const assets: Record<string, { assetVersionId: string; imageRevisionId: string }> = {}
  for (const imageId of ['a', 'b'])
    assets[imageId] = (await createImageAssetRevision(db, {
      ...common,
      imageId,
      storageNamespace: 'test',
      storageKey: `immutable/${imageId}/v1`,
      contentHash: 'a'.repeat(64),
      mediaType: 'image/jpeg',
      byteSize: 10,
      metadata: { attribution: 'Original' },
    }))!
  const gallery = {
    entries: {
      a: {
        imageRevisionId: assets.a.imageRevisionId,
        intent: 'canonical',
        caption: { en: 'A' },
        alt: {},
      },
      b: {
        imageRevisionId: assets.b.imageRevisionId,
        intent: 'general',
        caption: { en: 'B' },
        alt: {},
      },
    },
    order: ['a', 'b'],
  }
  const baseline = (await initializeFeatureRevision(db, {
    ...common,
    featureId: 'f',
    content: { gallery },
    published: true,
  }))!
  return { sqlite, db, common, assets, gallery, baseline }
}

describe('immutable image versions and gallery pins', () => {
  it('automatically records exact image versions and ordering with each feature snapshot', async () => {
    const f = await fixture()
    expect(
      f.sqlite
        .prepare(
          'SELECT imageId,position,imageRevisionId FROM featureRevisionImage WHERE featureRevisionId=? ORDER BY position',
        )
        .all(f.baseline),
    ).toEqual([
      { imageId: 'a', position: 0, imageRevisionId: f.assets.a.imageRevisionId },
      { imageId: 'b', position: 1, imageRevisionId: f.assets.b.imageRevisionId },
    ])
    expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
  it('creates metadata revisions without changing already-published galleries', async () => {
    const f = await fixture()
    const next = await createImageMetadataRevision(f.db, {
      ...f.common,
      imageId: 'a',
      previousRevisionId: f.assets.a.imageRevisionId,
      assetVersionId: f.assets.a.assetVersionId,
      metadata: { attribution: 'Corrected' },
    })
    expect(next).not.toBeNull()
    expect(
      f.sqlite
        .prepare(
          "SELECT imageRevisionId FROM featureRevisionImage WHERE featureRevisionId=? AND imageId='a'",
        )
        .get(f.baseline),
    ).toEqual({ imageRevisionId: f.assets.a.imageRevisionId })
    expect(() => f.sqlite.exec("UPDATE imageRevision SET metadata='{}'")).toThrow(
      /immutable/,
    )
  })
  it('retains prior gallery membership after removal and allows independent reordering', async () => {
    const f = await fixture()
    const reordered = (await createFeatureRevisionProposal(f.db, {
      ...f.common,
      featureId: 'f',
      baseRevisionId: f.baseline,
      content: { gallery: { ...f.gallery, order: ['b', 'a'] } },
    }))!
    const removed = (await createFeatureRevisionProposal(f.db, {
      ...f.common,
      featureId: 'f',
      baseRevisionId: f.baseline,
      content: { gallery: { entries: { a: f.gallery.entries.a }, order: ['a'] } },
    }))!
    expect(
      f.sqlite
        .prepare(
          'SELECT imageId FROM featureRevisionImage WHERE featureRevisionId=? ORDER BY position',
        )
        .all(reordered.candidateRevisionId),
    ).toEqual([{ imageId: 'b' }, { imageId: 'a' }])
    expect(
      f.sqlite
        .prepare(
          'SELECT count(*) n FROM featureRevisionImage WHERE featureRevisionId=?',
        )
        .get(removed.candidateRevisionId),
    ).toEqual({ n: 1 })
    expect(
      f.sqlite
        .prepare(
          'SELECT count(*) n FROM featureRevisionImage WHERE featureRevisionId=?',
        )
        .get(f.baseline),
    ).toEqual({ n: 2 })
    expect(f.sqlite.prepare('SELECT count(*) n FROM imageAssetVersion').get()).toEqual({
      n: 2,
    })
  })
  it('rejects mismatched image identity, invalid galleries and competing canonical entries atomically', async () => {
    const f = await fixture()
    const before = f.sqlite.prepare('SELECT count(*) n FROM revisionChangeSet').get()
    const invalid = [
      { ...f.gallery, order: ['a', 'a'] },
      { ...f.gallery, order: ['a', 'missing'] },
      {
        entries: {
          a: { ...f.gallery.entries.a, imageRevisionId: f.assets.b.imageRevisionId },
        },
        order: ['a'],
      },
      {
        ...f.gallery,
        entries: {
          ...f.gallery.entries,
          b: { ...f.gallery.entries.b, intent: 'canonical' },
        },
      },
    ]
    for (const gallery of invalid)
      await expect(
        createFeatureRevisionProposal(f.db, {
          ...f.common,
          featureId: 'f',
          baseRevisionId: f.baseline,
          content: { gallery },
        }),
      ).rejects.toThrow()
    expect(f.sqlite.prepare('SELECT count(*) n FROM revisionChangeSet').get()).toEqual(
      before,
    )
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureRevisionProposal').get(),
    ).toEqual({ n: 0 })
  })
  it('cannot overwrite a pinned object key, change gallery rows or delete pinned media', async () => {
    const f = await fixture()
    await expect(
      createImageAssetRevision(f.db, {
        ...f.common,
        imageId: 'a',
        storageNamespace: 'test',
        storageKey: 'immutable/a/v1',
        contentHash: 'b'.repeat(64),
        mediaType: 'image/jpeg',
        byteSize: 20,
        metadata: {},
      }),
    ).rejects.toThrow()
    expect(() =>
      f.sqlite.exec("UPDATE imageAssetVersion SET storageKey='replacement'"),
    ).toThrow(/immutable/)
    expect(() => f.sqlite.exec('DELETE FROM featureRevisionImage')).toThrow(/immutable/)
    expect(() => f.sqlite.exec("DELETE FROM image WHERE id='a'")).toThrow()
    expect(() =>
      f.sqlite
        .prepare("INSERT INTO featureRevisionImage VALUES (?,'a',?,9,'general')")
        .run(f.baseline, f.assets.a.imageRevisionId),
    ).toThrow(/snapshot/)
  })
})

it('links replacement pixels to their predecessor while old galleries keep the old asset', async () => {
  const f = await fixture()
  const replacement = await createImageAssetRevision(f.db, {
    ...f.common,
    imageId: 'a',
    previousRevisionId: f.assets.a.imageRevisionId,
    storageNamespace: 'test',
    storageKey: 'immutable/a/v2',
    contentHash: 'b'.repeat(64),
    mediaType: 'image/jpeg',
    byteSize: 20,
    metadata: { attribution: 'Original', rotation: 90 },
  })
  expect(replacement).not.toBeNull()
  expect(
    f.sqlite
      .prepare('SELECT previousRevisionId FROM imageRevision WHERE id=?')
      .get(replacement!.imageRevisionId),
  ).toEqual({ previousRevisionId: f.assets.a.imageRevisionId })
  expect(
    f.sqlite
      .prepare(
        "SELECT r.assetVersionId FROM featureRevisionImage g JOIN imageRevision r ON r.id=g.imageRevisionId WHERE g.featureRevisionId=? AND g.imageId='a'",
      )
      .get(f.baseline),
  ).toEqual({ assetVersionId: f.assets.a.assetVersionId })
})
