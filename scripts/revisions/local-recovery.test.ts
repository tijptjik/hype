// RUNTIME
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
// TESTS
import { afterEach, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
// DOMAIN
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { reviewInitialFeatureContribution } from '../../src/lib/db/services/featureInitialReview'
import {
  bootstrapLocalDatabase,
  seedLocalApplication,
} from '../breadline/lib/local-bootstrap'
import { importBreadlineFeatureRevisions } from '../breadline/features'
import { enrollLegacyRevisions } from './enroll'
import { mediaCacheKey } from './cache-media'
// TYPES
import type { MediaLocator } from './cache-media'

const directories: string[] = []
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true })
})

/** Builds a full migrated isolated database with explicit reviewed importer scope. @returns Fixture paths and inspection connection. */
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'hype-revision-recovery-'))
  directories.push(directory)
  const path = join(directory, 'target.sqlite'),
    target = new Database(path)
  bootstrapLocalDatabase(target, resolve('.'))
  seedLocalApplication(target)
  target.exec(`INSERT INTO user(id,name,createdAt,updatedAt) VALUES ('author','Claudio',1,1);
    INSERT INTO projectRole(projectId,userId,role) VALUES ('breadlinePrj','author','maintainer');
    INSERT INTO layer(id,projectId,organisationId,isPublished) VALUES ('1msQMcuqfHrP','breadlinePrj','hkfoodworks1',1),('kin0shUTfrUi','breadlinePrj','hkfoodworks1',1);`)
  target.exec('DELETE FROM image')
  const cache = join(directory, 'media')
  mkdirSync(cache)
  return { directory, path, target, cache, receipt: join(directory, 'receipt.json') }
}

/** Creates a tiny source whose hash is explicit, including an inactive donor. @param path SQLite output. @returns Nothing. */
function source(path: string): void {
  const db = new Database(path)
  db.exec(`CREATE TABLE breadline__public__donors(id INTEGER,name_en TEXT,name_zh TEXT,address_full_en TEXT,address_full_zh TEXT,longitude REAL,latitude REAL,active INTEGER,brand TEXT,phone TEXT,created_at TEXT,last_updated_at TEXT,_breadline_row_hash TEXT);
    INSERT INTO breadline__public__donors VALUES(900001,'Shop','店','Address','地址',114.1,22.3,0,'kayser',NULL,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z','hash');
    CREATE TABLE breadline__public__runs(donor_id INTEGER); INSERT INTO breadline__public__runs VALUES(900001);
    CREATE TABLE breadline__public__dropoffs(id INTEGER,name_en TEXT,name_zh TEXT,address_full_en TEXT,address_full_zh TEXT,longitude REAL,latitude REAL,created_at TEXT,last_updated_at TEXT,_breadline_row_hash TEXT);
    INSERT INTO breadline__public__dropoffs VALUES(900003,'Dropoff','收集點','Address','地址',114.1,22.3,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z','hash3');`)
  db.close()
}

test('attributed imports work after cutover, replay without new revisions, and roll back late failures', async () => {
  const f = fixture(),
    sourcePath = join(f.directory, 'source.sqlite')
  try {
    source(sourcePath)
    f.target.exec('UPDATE featureRevisionCreationPolicy SET enabled=1')
    const args = [
      '--source',
      sourcePath,
      '--target',
      f.path,
      '--output',
      join(f.directory, 'plan.sql'),
    ]
    expect((await importBreadlineFeatureRevisions(args)).created).toBe(2)
    expect(f.target.query('SELECT count(*) n FROM featureRevisionHead').get()).toEqual({
      n: 2,
    })
    expect(
      f.target
        .query(
          "SELECT count(*) n FROM revisionChangeSet WHERE actorId='system:breadline-import' AND origin='import'",
        )
        .get(),
    ).toEqual({ n: 2 })
    expect((await importBreadlineFeatureRevisions(args)).created).toBe(0)
    expect(f.target.query('SELECT count(*) n FROM featureRevision').get()).toEqual({
      n: 2,
    })
    // Model the settled retired state; identity publication itself has separate domain tests.
    const crosswalk = f.target
      .query("SELECT featureId FROM breadlineImportFeature WHERE sourceTable='donors'")
      .get() as { featureId: string }
    f.target
      .query(
        "UPDATE featureRevisionHead SET state='split',publishedRevisionId=NULL,generation=generation+1 WHERE featureId=?",
      )
      .run(crosswalk.featureId)
    f.target
      .query(
        "INSERT INTO featureRevisionWriteScope(featureId,token) VALUES (?,'settled-test')",
      )
      .run(crosswalk.featureId)
    f.target
      .query('DELETE FROM featureLocation WHERE featureId=?')
      .run(crosswalk.featureId)
    f.target
      .query('DELETE FROM featureRevisionWriteScope WHERE featureId=?')
      .run(crosswalk.featureId)
    expect((await importBreadlineFeatureRevisions(args)).created).toBe(0)
    expect(
      f.target
        .query(
          "SELECT featureId FROM breadlineImportFeature WHERE sourceTable='donors'",
        )
        .get(),
    ).toEqual(crosswalk)
    expect(f.target.query('SELECT count(*) n FROM featureRevision').get()).toEqual({
      n: 2,
    })
    const change = new Database(sourcePath)
    change.exec("UPDATE breadline__public__donors SET _breadline_row_hash='changed'")
    await expect(importBreadlineFeatureRevisions(args)).rejects.toThrow(
      'Source changed',
    )
    change.exec(
      "UPDATE breadline__public__donors SET _breadline_row_hash='hash'; INSERT INTO breadline__public__dropoffs VALUES(900004,'Another','店','Address','地址',114.1,22.3,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z','hash4')",
    )
    change.close()
    f.target.exec(
      "CREATE TRIGGER fail_revision BEFORE INSERT ON featureRevision BEGIN SELECT RAISE(ABORT,'late failure'); END",
    )
    await expect(importBreadlineFeatureRevisions(args)).rejects.toThrow()
    expect(
      f.target.query('SELECT count(*) n FROM breadlineImportFeature').get(),
    ).toEqual({ n: 2 })
    expect(f.target.query('SELECT count(*) n FROM feature').get()).toEqual({ n: 2 })
    expect(f.target.query('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    f.target.close()
  }
}, 30000)

/** Writes exact local media evidence without any network access. @param f Fixture. @returns Nothing. */
function media(f: ReturnType<typeof fixture>): void {
  const row = f.target
    .query(
      "SELECT id,cdn,env,publicId,version,modifiedAt,contentHash FROM image WHERE id='photo'",
    )
    .get() as MediaLocator
  const base = join(f.cache, mediaCacheKey(row)),
    bytes = Buffer.from('verified test bytes'),
    metadata = Buffer.from('{}')
  const digest = (value: Buffer): string =>
    createHash('sha256').update(value).digest('hex')
  writeFileSync(base + '.image', bytes)
  writeFileSync(base + '.json', metadata)
  writeFileSync(
    base + '.receipt.json',
    JSON.stringify({
      locator: row,
      status: 'verified',
      mediaType: 'image/jpeg',
      byteSize: bytes.length,
      contentHash: digest(bytes),
      metadataHash: digest(metadata),
    }),
  )
}

test('local recovery preserves photo authors and accepting an initial contribution keeps it unpublished', async () => {
  const f = fixture()
  try {
    f.target.exec(`INSERT INTO feature(id,projectId,organisationId,layerId,contributorId,geometry,isPublished,isDraft,isPendingReview) VALUES
      ('initial','breadlinePrj','hkfoodworks1','1msQMcuqfHrP','author','{"type":"Point","coordinates":[114,22]}',0,0,1);
      INSERT INTO featureI18n(featureId,locale,title) VALUES ('initial','en','Original');
      INSERT INTO image(id,contributorId,cdn,env,publicId,version) VALUES ('photo','author','cloudflareR2','local','photo.jpg',1);
      INSERT INTO featureImage(featureId,imageId,intent,isPublished) VALUES ('initial','photo','general',0);
      INSERT INTO task(id,organisationId,projectId,featureId,contributorId,type,isDraft) VALUES ('task','hkfoodworks1','breadlinePrj','initial','author','newFeature',0);
      INSERT INTO taskImage(taskId,imageId) VALUES ('task','photo');`)
    media(f)
    // Bootstrap migrations already recorded catalogue changes. Enrollment owns only its new changesets.
    const otherChanges = f.target.query(
      "SELECT id,actorId FROM revisionChangeSet WHERE actorId IS NOT 'system:feature-revision-enrollment' ORDER BY id",
    )
    const existingChanges = otherChanges.all()
    expect(await enrollLegacyRevisions(f.path, f.cache, f.receipt)).toEqual({
      images: 1,
      features: 1,
      blocked: 0,
    })
    expect(await enrollLegacyRevisions(f.path, f.cache, f.receipt)).toEqual({
      images: 1,
      features: 0,
      blocked: 0,
    })
    expect(
      f.target.query('SELECT actorId FROM featureImageUploadRevision').get(),
    ).toEqual({ actorId: 'author' })
    expect(otherChanges.all()).toEqual(existingChanges)
    expect(f.target.query('SELECT isPublished FROM featureImage').get()).toEqual({
      isPublished: 0,
    })
    expect(
      f.target.query('SELECT publishedRevisionId FROM featureRevisionHead').get(),
    ).toEqual({ publishedRevisionId: null })
    const domain = openSqliteDomain(f.path)
    try {
      expect(
        await reviewInitialFeatureContribution(domain.db, {
          featureId: 'initial',
          taskId: 'task',
          actorId: 'author',
          reason: 'Reviewed',
          accept: true,
          guard: sql`1`,
          completion: [],
        }),
      ).toBe(true)
      expect(f.target.query('SELECT isPublished FROM feature').get()).toEqual({
        isPublished: 0,
      })
      expect(f.target.query('SELECT isPublished FROM featureImage').get()).toEqual({
        isPublished: 0,
      })
      expect(
        f.target
          .query('SELECT publishedRevisionId,generation FROM featureRevisionHead')
          .get(),
      ).toEqual({ publishedRevisionId: null, generation: 1 })
    } finally {
      domain.close()
    }
  } finally {
    f.target.close()
  }
}, 30000)

test('unverified task photos block the whole Feature without leaking an initial revision', async () => {
  const f = fixture()
  try {
    f.target.exec(`INSERT INTO feature(id,projectId,organisationId,layerId,contributorId,geometry,isPublished) VALUES
      ('blocked','breadlinePrj','hkfoodworks1','1msQMcuqfHrP','author','{"type":"Point","coordinates":[114,22]}',1);
      INSERT INTO image(id,contributorId,cdn,env,publicId,version) VALUES ('photo','author','cloudflareR2','local','missing.jpg',1);
      INSERT INTO task(id,organisationId,projectId,featureId,contributorId,type,isDraft) VALUES ('task','hkfoodworks1','breadlinePrj','blocked','author','newPhoto',0);
      INSERT INTO taskImage(taskId,imageId) VALUES ('task','photo');`)
    const changes = f.target.query('SELECT id FROM revisionChangeSet ORDER BY id')
    const before = changes.all()
    expect(await enrollLegacyRevisions(f.path, f.cache, f.receipt)).toEqual({
      images: 0,
      features: 0,
      blocked: 2,
    })
    expect(f.target.query('SELECT count(*) n FROM featureRevision').get()).toEqual({
      n: 0,
    })
    expect(changes.all()).toEqual(before)
  } finally {
    f.target.close()
  }
}, 30000)

test('scoped empty recovery preserves gallery data and excludes unrelated Features', async () => {
  const f = fixture()
  try {
    f.target.exec(`INSERT INTO feature(id,projectId,organisationId,layerId,contributorId,geometry,isPublished) VALUES
      ('repair','breadlinePrj','hkfoodworks1','1msQMcuqfHrP','author','{"type":"Point","coordinates":[114,22]}',1),
      ('untouched','breadlinePrj','hkfoodworks1','1msQMcuqfHrP','author','{"type":"Point","coordinates":[114,22]}',1);
      INSERT INTO featureI18n(featureId,locale,title) VALUES ('repair','en','Repair');
      INSERT INTO image(id,contributorId,cdn,env,publicId,version) VALUES ('photo','author','cloudflareR2','local','photo.jpg',1);
      INSERT INTO featureImage(featureId,imageId,intent,isPublished) VALUES ('repair','photo','general',1);`)
    media(f)
    const locator = f.target
      .query(
        "SELECT id,cdn,env,publicId,version,modifiedAt,contentHash FROM image WHERE id='photo'",
      )
      .get() as MediaLocator
    const receiptPath = join(f.cache, mediaCacheKey(locator)) + '.receipt.json'
    const evidence = JSON.parse(readFileSync(receiptPath, 'utf8'))
    const options = {
      featureIds: ['repair'],
      emptyMetadataReason: 'User-approved empty baseline',
    }
    evidence.metadataRecovery = {
      kind: 'empty-missing-sidecar',
      missingVersion: 1,
      reason: options.emptyMetadataReason,
    }
    writeFileSync(receiptPath, JSON.stringify(evidence))
    expect(
      (
        await enrollLegacyRevisions(f.path, f.cache, f.receipt, undefined, {
          featureIds: ['repair'],
        })
      ).features,
    ).toBe(0)
    expect(
      await enrollLegacyRevisions(f.path, f.cache, f.receipt, undefined, options),
    ).toEqual({ images: 1, features: 1, blocked: 0 })
    expect(f.target.query('SELECT featureId FROM featureRevisionHead').all()).toEqual([
      { featureId: 'repair' },
    ])
    expect(
      f.target
        .query(
          "SELECT json_extract(metadata,'$.baselineRecovery.kind') kind FROM imageRevision",
        )
        .get(),
    ).toEqual({ kind: 'empty-missing-sidecar' })
    expect(
      (await enrollLegacyRevisions(f.path, f.cache, f.receipt, undefined, options))
        .features,
    ).toBe(0)
    expect(f.target.query('SELECT count(*) n FROM imageRevision').get()).toEqual({
      n: 1,
    })
    expect(f.target.query('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    f.target.close()
  }
}, 30000)
