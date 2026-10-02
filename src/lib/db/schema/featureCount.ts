// DRIZZLE
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { feature } from './feature'
// TYPES
import type { FeatureQueryPage } from '#lib/api/services/featureQuery.types.js'

/** One canonical feature contribution; OLD dimensions survive parent deletion cascades. */
export const featureCountEntry = sqliteTable('featureCountEntry', {
  featureId: text('featureId')
    .primaryKey()
    .notNull()
    .references(() => feature.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  organisationId: text('organisationId').notNull(),
  projectId: text('projectId').notNull(),
  layerId: text('layerId').notNull(),
  isPublished: integer('isPublished', { mode: 'boolean' }).notNull(),
  isArchived: integer('isArchived', { mode: 'boolean' }).notNull(),
  isDraft: integer('isDraft', { mode: 'boolean' }).notNull(),
  isVisitable: integer('isVisitable', { mode: 'boolean' }).notNull(),
  isIntangible: integer('isIntangible', { mode: 'boolean' }).notNull(),
  divisionLeafId: text('divisionLeafId').notNull(),
  divisionLevel1Id: text('divisionLevel1Id').notNull(),
  divisionLevel2Id: text('divisionLevel2Id').notNull(),
  divisionLevel3Id: text('divisionLevel3Id').notNull(),
  divisionLevel4Id: text('divisionLevel4Id').notNull(),
  divisionLevel5Id: text('divisionLevel5Id').notNull(),
  divisionLevel6Id: text('divisionLevel6Id').notNull(),
  landformLeafId: text('landformLeafId').notNull(),
})

/** Exact totals for scope, status, flag and division combinations, maintained by entry deltas. */
export const featureCountRollup = sqliteTable(
  'featureCountRollup',
  {
    organisationId: text('organisationId').notNull(),
    projectId: text('projectId').notNull(),
    layerId: text('layerId').notNull(),
    isPublished: integer('isPublished', { mode: 'boolean' }).notNull(),
    isArchived: integer('isArchived', { mode: 'boolean' }).notNull(),
    isDraft: integer('isDraft', { mode: 'boolean' }).notNull(),
    isVisitable: integer('isVisitable', { mode: 'boolean' }).notNull(),
    isIntangible: integer('isIntangible', { mode: 'boolean' }).notNull(),
    divisionLeafId: text('divisionLeafId').notNull(),
    divisionLevel1Id: text('divisionLevel1Id').notNull(),
    divisionLevel2Id: text('divisionLevel2Id').notNull(),
    divisionLevel3Id: text('divisionLevel3Id').notNull(),
    divisionLevel4Id: text('divisionLevel4Id').notNull(),
    divisionLevel5Id: text('divisionLevel5Id').notNull(),
    divisionLevel6Id: text('divisionLevel6Id').notNull(),
    landformLeafId: text('landformLeafId').notNull(),
    totalCount: integer('totalCount').notNull(),
  },
  table => [
    primaryKey({
      columns: [
        table.organisationId,
        table.projectId,
        table.layerId,
        table.isPublished,
        table.isArchived,
        table.isDraft,
        table.isVisitable,
        table.isIntangible,
        table.divisionLeafId,
        table.divisionLevel1Id,
        table.divisionLevel2Id,
        table.divisionLevel3Id,
        table.divisionLevel4Id,
        table.divisionLevel5Id,
        table.divisionLevel6Id,
        table.landformLeafId,
      ],
    }),
    index('feature_count_rollup_layer_idx').on(
      table.layerId,
      table.isDraft,
      table.isPublished,
      table.isArchived,
    ),
    index('feature_count_rollup_visibility_idx').on(
      table.isDraft,
      table.isPublished,
      table.isArchived,
      table.layerId,
    ),
  ],
)

/** Dataset-wide invalidation counter, changed only by canonical source mutations. */
export const featureCountRevision = sqliteTable('featureCountRevision', {
  id: integer('id').primaryKey(),
  revision: integer('revision').notNull().default(0),
})

/** User-list invalidation is independent of all other users and public dataset queries. */
export const featureCountUserRevision = sqliteTable('featureCountUserRevision', {
  userId: text('userId').primaryKey().notNull(),
  revision: integer('revision').notNull().default(0),
})

/** Bounded persisted aggregate cache; trusted query identity and revisions govern reuse. */
export const featureCountCache = sqliteTable(
  'featureCountCache',
  {
    key: text('key').primaryKey().notNull(),
    revision: integer('revision').notNull(),
    userRevision: integer('userRevision').notNull().default(0),
    totalCount: integer('totalCount').notNull(),
    facets: text('facets', { mode: 'json' })
      .$type<NonNullable<FeatureQueryPage['facets']>>()
      .notNull(),
    updatedAt: integer('updatedAt').notNull(),
  },
  table => [index('feature_count_cache_updated_idx').on(table.updatedAt, table.key)],
)
