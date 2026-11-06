// TESTS
import { describe, expect, it } from 'vitest'
// DB
import {
  deleteDetachedImage,
  hasImageStorageReference,
} from '#lib/db/services/imageCleanup.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database } from '#lib/types.js'

/** Creates a disposable database containing each image-reference shape. */
function setup() {
  const { db, sqlite } = publicationSqlite({})
  sqlite.exec(`CREATE TABLE image(id TEXT PRIMARY KEY);
    CREATE TABLE project(id TEXT,imageId TEXT);
    CREATE TABLE organisation(id TEXT,imageId TEXT);
    CREATE TABLE hub(id TEXT,imageId TEXT);
    CREATE TABLE featureImage(imageId TEXT);
    CREATE TABLE taskImage(imageId TEXT);
    INSERT INTO image VALUES('old'),('other');`)
  return { db: db as unknown as Database, sqlite }
}

describe('detached image cleanup', () => {
  it.each(['project', 'organisation', 'hub', 'featureImage', 'taskImage'])(
    'preserves an image referenced by %s',
    async table => {
      const { db, sqlite } = setup()
      try {
        sqlite.exec(`INSERT INTO ${table}(imageId) VALUES('old')`)
        expect(await deleteDetachedImage(db, 'old')).toBe(false)
        expect(sqlite.prepare("SELECT id FROM image WHERE id='old'").get()).toBeTruthy()
        sqlite.exec(`DELETE FROM ${table}`)
        expect(await deleteDetachedImage(db, 'old')).toBe(true)
        expect(await deleteDetachedImage(db, 'old')).toBe(false)
        expect(sqlite.prepare('SELECT id FROM image').all()).toEqual([{ id: 'other' }])
      } finally {
        sqlite.close()
      }
    },
  )
})

it('retains shared object identities only in their owning environment', async () => {
  const { db, sqlite } = setup()
  try {
    sqlite.exec(
      "ALTER TABLE image ADD COLUMN env TEXT; ALTER TABLE image ADD COLUMN publicId TEXT; UPDATE image SET env='local', publicId='shared' WHERE id='other'",
    )
    expect(await deleteDetachedImage(db, 'old')).toBe(true)
    expect(
      await hasImageStorageReference(db, { env: 'local', publicId: 'shared' }),
    ).toBe(true)
    expect(
      await hasImageStorageReference(db, { env: 'production', publicId: 'shared' }),
    ).toBe(false)
    expect(
      await hasImageStorageReference(db, { env: 'local', publicId: 'different' }),
    ).toBe(false)
    expect(await deleteDetachedImage(db, 'other')).toBe(true)
    expect(
      await hasImageStorageReference(db, { env: 'local', publicId: 'shared' }),
    ).toBe(false)
  } finally {
    sqlite.close()
  }
})

it('retains a detached logo referenced only by immutable organisation history', async () => {
  const { db, sqlite } = setup()
  try {
    sqlite.exec(`
      CREATE TABLE organisationRevision(content TEXT);
      CREATE TABLE organisationRevisionHead(organisationId TEXT);
      CREATE TABLE organisationRevisionWrite(organisationId TEXT);
      INSERT INTO organisationRevision VALUES('{"record":{"imageId":"old"}}');
    `)
    expect(await deleteDetachedImage(db, 'old')).toBe(false)
    expect(await deleteDetachedImage(db, 'other')).toBe(true)
    expect(sqlite.prepare('SELECT id FROM image').all()).toEqual([{ id: 'old' }])
  } finally {
    sqlite.close()
  }
})
