// DRIZZLE
import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { location } from './location'
import { user } from './user'
// TYPES
import type { Collection } from '#lib/indoor/model.js'

/** Small discovery projection and optimistic draft/publication pointers; geometry lives in R2. */
export const premisesMap = sqliteTable('premisesMap', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  nameZh: text('nameZh').notNull(),
  kind: text('kind', { enum: ['station', 'building', 'complex'] }).notNull(),
  footprint: text('footprint', { mode: 'json' }).$type<Collection>(),
  draftHash: text('draftHash'),
  draftVersion: integer('draftVersion').notNull().default(0),
  publishedHash: text('publishedHash'),
  publishedVersion: integer('publishedVersion').notNull().default(0),
  updatedBy: text('updatedBy').notNull(),
  updatedAt: text('updatedAt').notNull(),
})
/** Published release receipts fence public access to immutable R2 objects. */
export const premisesMapPublication = sqliteTable(
  'premisesMapPublication',
  {
    mapId: text('mapId')
      .notNull()
      .references(() => premisesMap.id),
    version: integer('version').notNull(),
    hash: text('hash').notNull(),
    actorId: text('actorId').notNull(),
    createdAt: text('createdAt').notNull(),
  },
  t => [primaryKey({ columns: [t.mapId, t.version] })],
)
/** Stable source polygon to canonical physical unit relationship, independent of tenants. */
export const premisesMapUnit = sqliteTable(
  'premisesMapUnit',
  {
    mapId: text('mapId')
      .notNull()
      .references(() => premisesMap.id),
    unitId: text('unitId').notNull(),
    locationId: text('locationId')
      .notNull()
      .references(() => location.id),
  },
  t => [primaryKey({ columns: [t.mapId, t.unitId] })],
)

/** Immutable draft edit receipts preserve authorship even before publication. */
export const premisesMapDraftRevision = sqliteTable(
  'premisesMapDraftRevision',
  {
    mapId: text('mapId')
      .notNull()
      .references(() => premisesMap.id),
    version: integer('version').notNull(),
    hash: text('hash').notNull(),
    actorId: text('actorId').notNull(),
    createdAt: text('createdAt').notNull(),
  },
  t => [primaryKey({ columns: [t.mapId, t.version] })],
)

/** Current label and connection corrections keyed by stable source identity; edits replace the row without revision history. */
export const premisesMapCorrection = sqliteTable(
  'premisesMapCorrection',
  {
    mapId: text('mapId')
      .notNull()
      .references(() => premisesMap.id),
    sourceDataset: text('sourceDataset').notNull(),
    sourceLayer: text('sourceLayer').notNull(),
    sourceEntityId: text('sourceEntityId').notNull(),
    field: text('field').notNull(),
    originalValue: text('originalValue'),
    correctedValue: text('correctedValue').notNull(),
    sourceSnapshotHash: text('sourceSnapshotHash').notNull(),
    reason: text('reason').notNull(),
    authorUserId: text('authorUserId')
      .notNull()
      .references(() => user.id),
  },
  t => [
    primaryKey({
      columns: [t.mapId, t.sourceDataset, t.sourceLayer, t.sourceEntityId, t.field],
    }),
  ],
)
