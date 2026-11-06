// DRIZZLE
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
// SCHEMA
import { image } from './image'
import { featureRevision, revisionChangeSet } from './featureRevision'
// TYPES
import type { RevisionValue } from '#lib/revisions/merge.js'

/** Immutable object locator; replacing pixels requires another version and object key. */
export const imageAssetVersion = sqliteTable(
  'imageAssetVersion',
  {
    id: text('id').primaryKey(),
    imageId: text('imageId')
      .notNull()
      .references(() => image.id, { onDelete: 'restrict' }),
    storageNamespace: text('storageNamespace').notNull(),
    storageKey: text('storageKey').notNull(),
    contentHash: text('contentHash').notNull(),
    mediaType: text('mediaType').notNull(),
    byteSize: integer('byteSize').notNull(),
    changeSetId: text('changeSetId')
      .notNull()
      .references(() => revisionChangeSet.id),
  },
  table => [
    unique('image_asset_owner').on(table.imageId, table.id),
    unique('image_asset_object').on(table.storageNamespace, table.storageKey),
    check('image_asset_byte_size', sql`${table.byteSize} >= 0`),
  ],
)

/** Image-level metadata revisions are independent of a feature's caption and ordering. */
export const imageRevision = sqliteTable(
  'imageRevision',
  {
    id: text('id').primaryKey(),
    imageId: text('imageId')
      .notNull()
      .references(() => image.id, { onDelete: 'restrict' }),
    previousRevisionId: text('previousRevisionId'),
    assetVersionId: text('assetVersionId').notNull(),
    changeSetId: text('changeSetId')
      .notNull()
      .references(() => revisionChangeSet.id),
    metadata: text('metadata', { mode: 'json' }).$type<RevisionValue>().notNull(),
  },
  table => [
    unique('image_revision_owner').on(table.imageId, table.id),
    foreignKey({
      columns: [table.imageId, table.assetVersionId],
      foreignColumns: [imageAssetVersion.imageId, imageAssetVersion.id],
    }),
    foreignKey({
      columns: [table.imageId, table.previousRevisionId],
      foreignColumns: [table.imageId, table.id],
    }),
    check('image_revision_metadata_json', sql`json_valid(${table.metadata})`),
  ],
)

/** Derived immutable gallery references, populated by the feature snapshot insert trigger. */
export const featureRevisionImage = sqliteTable(
  'featureRevisionImage',
  {
    featureRevisionId: text('featureRevisionId')
      .notNull()
      .references(() => featureRevision.id, { onDelete: 'restrict' }),
    imageId: text('imageId').notNull(),
    imageRevisionId: text('imageRevisionId').notNull(),
    position: integer('position').notNull(),
    intent: text('intent').notNull(),
  },
  table => [
    primaryKey({ columns: [table.featureRevisionId, table.imageId] }),
    foreignKey({
      columns: [table.imageId, table.imageRevisionId],
      foreignColumns: [imageRevision.imageId, imageRevision.id],
    }),
    unique('feature_revision_image_position').on(
      table.featureRevisionId,
      table.position,
    ),
    uniqueIndex('feature_revision_image_canonical')
      .on(table.featureRevisionId)
      .where(sql`${table.intent}='canonical'`),
    check('feature_revision_image_position_valid', sql`${table.position} >= 0`),
  ],
)
