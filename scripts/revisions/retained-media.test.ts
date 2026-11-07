import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { retainedMetadata, verifiedRetainedPin } from './retained-media'
import type { MediaLocator } from './cache-media'

test('retained evidence requires exact ownership, locator, version and unambiguous metadata', () => {
  const db = new Database(':memory:')
  const hash = 'a'.repeat(64)
  const locator: MediaLocator = {
    id: 'image',
    cdn: 'cloudflareR2',
    env: 'local',
    publicId: 'original',
    version: 2,
    modifiedAt: 'now',
    contentHash: hash,
  }
  try {
    db.exec(`CREATE TABLE imageRevision(id TEXT,imageId TEXT,assetVersionId TEXT,metadata TEXT);
      CREATE TABLE imageAssetVersion(id TEXT,imageId TEXT,storageNamespace TEXT,storageKey TEXT,contentHash TEXT);`)
    db.query('INSERT INTO imageAssetVersion VALUES(?,?,?,?,?)').run(
      'asset',
      'image',
      'local',
      'original',
      hash,
    )
    db.query('INSERT INTO imageRevision VALUES(?,?,?,?)').run(
      'revision',
      'image',
      'asset',
      JSON.stringify({ version: 2, credit: 'Author' }),
    )
    expect(retainedMetadata(db, locator)?.imageRevisionId).toBe('revision')
    for (const changed of [
      { version: 1 },
      { env: 'production' },
      { publicId: 'replacement' },
      { id: 'other' },
    ])
      expect(retainedMetadata(db, { ...locator, ...changed })).toBeUndefined()
    expect(() =>
      retainedMetadata(db, { ...locator, contentHash: 'b'.repeat(64) }),
    ).toThrow('hash mismatch')
    db.query('INSERT INTO imageRevision VALUES(?,?,?,?)').run(
      'conflict',
      'image',
      'asset',
      JSON.stringify({ version: 2, credit: 'Other author' }),
    )
    expect(() => retainedMetadata(db, locator)).toThrow('Ambiguous')
  } finally {
    db.close()
  }
})

test('reuses exact retained history including recovery provenance without minting metadata', () => {
  const db = new Database(':memory:')
  const hash = 'a'.repeat(64)
  const locator: MediaLocator = {
    id: 'image',
    cdn: 'cloudflareR2',
    env: 'local',
    publicId: 'original',
    version: 2,
    modifiedAt: 'now',
    contentHash: hash,
  }
  try {
    db.exec(`CREATE TABLE image(id TEXT,presentationMode TEXT);
      CREATE TABLE imageRevision(id TEXT,imageId TEXT,assetVersionId TEXT,metadata TEXT);
      CREATE TABLE imageAssetVersion(id TEXT,imageId TEXT,storageNamespace TEXT,storageKey TEXT,contentHash TEXT,byteSize INTEGER,mediaType TEXT);
      INSERT INTO image VALUES('image','contain');`)
    db.query('INSERT INTO imageAssetVersion VALUES(?,?,?,?,?,?,?)').run(
      'asset',
      'image',
      'local',
      'original',
      hash,
      3,
      'image/png',
    )
    db.query('INSERT INTO imageRevision VALUES(?,?,?,?)').run(
      'revision',
      'image',
      'asset',
      JSON.stringify({
        version: 2,
        presentationMode: 'contain',
        baselineRecovery: { reason: 'Previously reviewed' },
      }),
    )
    const evidence = {
      contentHash: hash,
      byteSize: 3,
      mediaType: 'image/png',
      metadata: {},
    }
    expect(verifiedRetainedPin(db, locator, evidence)).toEqual({
      imageRevisionId: 'revision',
      assetVersionId: 'asset',
    })
    for (const changed of [
      { byteSize: 4 },
      { contentHash: 'b'.repeat(64) },
      { mediaType: 'image/jpeg' },
      { metadata: { credit: 'Changed' } },
    ])
      expect(
        verifiedRetainedPin(db, locator, { ...evidence, ...changed }),
      ).toBeUndefined()
    db.exec("UPDATE image SET presentationMode='cast-edges'")
    expect(verifiedRetainedPin(db, locator, evidence)).toBeUndefined()
  } finally {
    db.close()
  }
})
