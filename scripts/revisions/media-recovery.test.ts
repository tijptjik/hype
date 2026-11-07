// RUNTIME
import { Database } from 'bun:sqlite'
// TESTS
import { expect, test } from 'bun:test'
// RECOVERY
import { readMetadataEvidence } from './cache-media'
import { scopedMediaRows, validateMediaScope } from './media-scope'

test('empty metadata needs explicit approval and a confirmed missing sidecar', async () => {
  await expect(
    readMetadataEvidence(new Response(null, { status: 404 }), 7),
  ).rejects.toThrow('404')
  const recovered = await readMetadataEvidence(
    new Response(null, { status: 404 }),
    7,
    'Approved repair',
  )
  expect(new TextDecoder().decode(recovered.bytes)).toBe('{}')
  expect(recovered.recovery).toEqual({
    kind: 'empty-missing-sidecar',
    missingVersion: 7,
    reason: 'Approved repair',
  })
  for (const status of [401, 403, 500])
    await expect(
      readMetadataEvidence(new Response(null, { status }), 7, 'Approved repair'),
    ).rejects.toThrow(String(status))
  const exact = await readMetadataEvidence(
    new Response('{"credit":"Existing"}'),
    7,
    'Approved repair',
  )
  expect(exact.recovery).toBeUndefined()
  expect(new TextDecoder().decode(exact.bytes)).toBe('{"credit":"Existing"}')
})

test('recovery is limited to explicitly named Features and their pending evidence', () => {
  const db = new Database(':memory:')
  try {
    db.exec(`CREATE TABLE feature(id TEXT PRIMARY KEY);
      CREATE TABLE image(id TEXT,cdn TEXT,env TEXT,publicId TEXT,version INTEGER,modifiedAt TEXT,contentHash TEXT);
      CREATE TABLE featureImage(featureId TEXT,imageId TEXT);
      CREATE TABLE task(id TEXT,featureId TEXT,isReviewed INTEGER);
      CREATE TABLE taskImage(taskId TEXT,imageId TEXT);
      INSERT INTO feature VALUES('target'),('other');
      INSERT INTO image(id) VALUES('gallery'),('pending'),('reviewed'),('other');
      INSERT INTO featureImage VALUES('target','gallery'),('other','other');
      INSERT INTO task VALUES('pending','target',0),('reviewed','target',1);
      INSERT INTO taskImage VALUES('pending','pending'),('reviewed','reviewed');`)
    expect(() => validateMediaScope(db, { emptyMetadataReason: 'Repair' })).toThrow(
      'explicit Feature IDs',
    )
    expect(() => validateMediaScope(db, { featureIds: [] })).toThrow('nonempty')
    expect(() => validateMediaScope(db, { featureIds: ['missing'] })).toThrow(
      'missing identities',
    )
    validateMediaScope(db, { featureIds: ['target'], emptyMetadataReason: 'Repair' })
    expect(scopedMediaRows(db, ['target']).map(row => row.id)).toEqual([
      'gallery',
      'pending',
    ])
  } finally {
    db.close()
  }
})

test('baseline scope includes all revision dependencies and leaves orphans untouched', () => {
  const db = new Database(':memory:')
  try {
    db.exec(`CREATE TABLE image(id TEXT,cdn TEXT,env TEXT,publicId TEXT,version INTEGER,modifiedAt TEXT,contentHash TEXT);
      CREATE TABLE featureImage(imageId TEXT); CREATE TABLE taskImage(imageId TEXT);
      CREATE TABLE organisation(imageId TEXT); CREATE TABLE project(imageId TEXT); CREATE TABLE hub(imageId TEXT);
      CREATE TABLE imageAssetVersion(imageId TEXT); CREATE TABLE imageRevision(imageId TEXT);
      INSERT INTO image(id) VALUES('gallery'),('task'),('logo'),('history'),('orphan');
      INSERT INTO featureImage VALUES('gallery'); INSERT INTO taskImage VALUES('task');
      INSERT INTO hub VALUES('logo'); INSERT INTO imageRevision VALUES('history');`)
    expect(scopedMediaRows(db, undefined, true).map(row => row.id)).toEqual([
      'gallery',
      'history',
      'logo',
      'task',
    ])
    expect(db.query('SELECT count(*) n FROM image').get()).toEqual({ n: 5 })
  } finally {
    db.close()
  }
})
