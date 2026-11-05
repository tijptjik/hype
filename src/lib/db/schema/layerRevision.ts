// DRIZZLE
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  integer,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core'
// SCHEMA
import { layer } from './layer'
import { revisionChangeSet } from './featureRevision'
// TYPES
import type { RevisionValue } from '#lib/revisions/merge.js'

/** Immutable layer profile/configuration evidence; permissions are not restored from it. */
export const layerRevision = sqliteTable(
  'layerRevision',
  {
    id: text('id').primaryKey(),
    layerId: text('layerId')
      .notNull()
      .references(() => layer.id, { onDelete: 'restrict' }),
    previousRevisionId: text('previousRevisionId'),
    changeSetId: text('changeSetId')
      .notNull()
      .references(() => revisionChangeSet.id),
    content: text('content', { mode: 'json' }).$type<RevisionValue>().notNull(),
    schemaVersion: integer('schemaVersion').notNull().default(1),
  },
  table => [
    unique('layer_revision_owner').on(table.layerId, table.id),
    foreignKey({
      columns: [table.layerId, table.previousRevisionId],
      foreignColumns: [table.layerId, table.id],
    }),
    check(
      'layer_revision_content',
      sql`json_valid(${table.content}) AND ${table.schemaVersion}=1`,
    ),
  ],
)

/** Admin edits immediately advance this head and the existing public projection together. */
export const layerRevisionHead = sqliteTable(
  'layerRevisionHead',
  {
    layerId: text('layerId')
      .primaryKey()
      .references(() => layer.id, { onDelete: 'restrict' }),
    currentRevisionId: text('currentRevisionId').notNull(),
    generation: integer('generation').notNull().default(0),
  },
  table => [
    foreignKey({
      columns: [table.layerId, table.currentRevisionId],
      foreignColumns: [layerRevision.layerId, layerRevision.id],
    }),
    check('layer_revision_generation', sql`${table.generation} >= 0`),
  ],
)

/** Transaction-local capture scope; successful and rolled-back commands leave no rows here. */
export const layerRevisionWrite = sqliteTable('layerRevisionWrite', {
  // Creation commands establish the scope before inserting the layer identity.
  layerId: text('layerId').primaryKey(),
  token: text('token').notNull(),
  revisionId: text('revisionId').notNull(),
  baselineRevisionId: text('baselineRevisionId').notNull(),
})
