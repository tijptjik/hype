// NODE
import { readFileSync } from 'node:fs'
// DRIZZLE
import { getTableColumns, getTableName, sql } from 'drizzle-orm'
// SCHEMA
import {
  feature,
  featureI18n,
  featureProperty,
  featurePropertyI18n,
} from '#lib/db/schema/feature.js'
import { featureImage, image } from '#lib/db/schema/image.js'
import { featureLocation } from '#lib/db/schema/location.js'
import { featureLocationMembership } from '#lib/db/schema/locationRelationships.js'
import {
  property,
  propertyI18n,
  propertyValue,
  propertyValueI18n,
} from '#lib/db/schema/property.js'
// SERVICES
import { readFeatureRevisionSource } from '#lib/db/services/featureRevisionSource.js'
import { buildFeatureRevisionBaselineContent } from '#lib/db/services/featureRevisionContent.js'
import { initializeCurrentFeatureRevision } from '#lib/db/services/featureLifecycle.js'
// FIXTURES
import { publicationSqlite } from './publicationSqlite'
import {
  featureRevisionSourceFixture,
  featureRevisionLocationFixture,
} from './featureRevisionContent'
// TYPES
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { Database } from '#lib/types.js'
import type { RevisionValue } from '#lib/revisions/merge.js'
const media = {
  revisions: { photo: 'image-r1', research: 'private-r1' },
  order: ['photo', 'research'],
}
const common = { featureId: 'f', actorId: 'author', guard: sql`1` }
/** Build the target schema in an isolated SQLite database with real content/image constraints. */
export function lifecycleFixture(linked = false, catalogueCascades = false) {
  const connection = publicationSqlite({})
  const { sqlite } = connection
  sqlite.exec('CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,username TEXT,displayUsername TEXT,attribution TEXT)')
  sqlite.exec('PRAGMA foreign_keys=ON')
  sqlite.exec(`CREATE TABLE organisation(id TEXT PRIMARY KEY,hubId TEXT,isPublished INTEGER,isArchived INTEGER);
    CREATE TABLE project(id TEXT PRIMARY KEY,organisationId TEXT,isPublished INTEGER,isArchived INTEGER);
    CREATE TABLE layer(id TEXT PRIMARY KEY,organisationId TEXT,projectId TEXT,isPublished INTEGER,isArchived INTEGER);
    INSERT INTO organisation VALUES ('org',NULL,1,0);
    INSERT INTO project VALUES ('project','org',1,0);
    INSERT INTO layer VALUES ('layer','org','project',1,0);`)
  sqlite.exec(
    `ALTER TABLE layer ADD COLUMN historicalSourceLayerId TEXT; ALTER TABLE project ADD COLUMN flags TEXT DEFAULT '{}'; ALTER TABLE organisation ADD COLUMN isHubExclusive INTEGER DEFAULT 0;`,
  )
  const composite: Record<string, string> = {
    featureI18n: ', PRIMARY KEY(featureId,locale)',
    featureProperty:
      ', PRIMARY KEY(featureId,propertyId)' +
      (catalogueCascades
        ? ', FOREIGN KEY(propertyId) REFERENCES property(id) ON DELETE CASCADE, FOREIGN KEY(propertyValueId) REFERENCES propertyValue(id) ON DELETE SET NULL'
        : ''),
    featurePropertyI18n:
      ', PRIMARY KEY(featureId,propertyId,locale), FOREIGN KEY(featureId,propertyId) REFERENCES featureProperty(featureId,propertyId)' +
      (catalogueCascades ? ' ON DELETE CASCADE' : ''),
    featureImage:
      ', PRIMARY KEY(featureId,imageId), FOREIGN KEY(imageId) REFERENCES image(id)',
    featureLocationMembership: ', PRIMARY KEY(featureId,containerLocationId,role)',
  }
  for (const table of [
    feature,
    featureI18n,
    featureProperty,
    featurePropertyI18n,
    featureImage,
    image,
    featureLocation,
    featureLocationMembership,
    property,
    propertyI18n,
    propertyValue,
    propertyValueI18n,
  ]) {
    const name = getTableName(table)
    const columns = Object.values(getTableColumns(table)).map(
      column =>
        `"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`,
    )
    sqlite.exec(`CREATE TABLE "${name}" (${columns.join(',')}${composite[name] ?? ''})`)
  }
  const source = featureRevisionSourceFixture()
  if (linked) {
    const accepted = featureRevisionLocationFixture()
    const { associationVersion, acceptedOverrides, memberships, ...references } =
      accepted
    source.location = [
      {
        ...references,
        version: associationVersion,
        overrides: acceptedOverrides,
        featureId: 'f',
        actorId: 'location-reviewer',
      },
    ]
    source.locationMemberships = memberships.map(row => ({ ...row, featureId: 'f' }))
  }
  const seed = (table: SQLiteTable, rows: Record<string, RevisionValue>[]) => {
    const columns = getTableColumns(table)
    for (const row of rows) {
      const keys = Object.keys(row)
      sqlite
        .prepare(
          `INSERT INTO "${getTableName(table)}" (${keys.map(key => `"${columns[key].name}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        )
        .run(
          ...(keys.map(key => {
            const value = row[key]
            return typeof value === 'boolean'
              ? Number(value)
              : value !== null && typeof value === 'object'
                ? JSON.stringify(value)
                : value
          }) as never[]),
        )
    }
  }
  seed(feature, [source.record])
  seed(featureI18n, source.translations)
  seed(property, source.fieldDefinitions)
  seed(propertyI18n, source.fieldTranslations)
  seed(propertyValue, source.fieldOptions)
  seed(propertyValueI18n, source.fieldOptionTranslations)
  seed(featureProperty, source.properties)
  seed(featurePropertyI18n, source.propertyTranslations)
  seed(image, source.images)
  seed(featureImage, source.galleryLinks)
  seed(featureLocation, source.location)
  seed(featureLocationMembership, source.locationMemberships)
  sqlite.exec(readFileSync('migrations/pending/feature-lifecycle/target.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0172_image_revisions.sql', 'utf8'))
  sqlite.exec(`CREATE TABLE task(id TEXT PRIMARY KEY, featureId TEXT,proposalId TEXT REFERENCES featureRevisionProposal(id),projectId TEXT,organisationId TEXT,
    contributorId TEXT,isDraft INTEGER,isReviewed INTEGER,modifiedAt TEXT,type TEXT,
    reviewerId TEXT,reviewReason TEXT,reviewOutcome TEXT,reviewAction TEXT,message TEXT,createdAt TEXT);
    CREATE TABLE taskImage(taskId TEXT REFERENCES task(id),imageId TEXT REFERENCES image(id),PRIMARY KEY(taskId,imageId));`)
  sqlite.exec(
    "INSERT INTO revisionChangeSet(id,actorId,origin,createdAt) VALUES ('media-baseline','fixture','migration','now')",
  )
  for (const [id, revision] of Object.entries(media.revisions)) {
    sqlite
      .prepare(
        'INSERT INTO imageAssetVersion(id,imageId,storageNamespace,storageKey,contentHash,mediaType,byteSize,changeSetId) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(
        `asset-${id}`,
        id,
        'local',
        `immutable-${id}`,
        'a'.repeat(64),
        'image/jpeg',
        10,
        'media-baseline',
      )
    sqlite
      .prepare(
        'INSERT INTO imageRevision(id,imageId,assetVersionId,changeSetId,metadata) VALUES (?,?,?,?,?)',
      )
      .run(
        revision,
        id,
        `asset-${id}`,
        'media-baseline',
        '{"version":1,"presentationMode":"contain"}',
      )
  }
  const db = connection.db as unknown as Database
  const capture = async () => {
    const captured = await readFeatureRevisionSource(db, 'f', sql`1`)
    if (!captured) throw new Error('Source missing')
    return captured
  }
  const initialize = async (published = true) => {
    sqlite
      .prepare('UPDATE feature SET isPublished=?,localIsPublished=? WHERE id=?')
      .run(Number(published), Number(published), 'f')
    const captured = await capture()
    const content = buildFeatureRevisionBaselineContent(captured.snapshot, media)
    const revisionId = await initializeCurrentFeatureRevision(db, {
      ...common,
      content,
      guard: captured.unchanged,
    })
    if (!revisionId) throw new Error('Baseline failed')
    return { content, revisionId }
  }
  return { db, sqlite, source, seed, capture, initialize }
}
