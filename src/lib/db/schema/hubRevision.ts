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
import { hub } from './hub'
import { revisionChangeSet } from './featureRevision'
// TYPES
import type { RevisionValue } from '#lib/revisions/merge.js'

/** Immutable hub profile/configuration evidence; permissions are not restored from it. */
export const hubRevision = sqliteTable(
  'hubRevision',
  {
    id: text('id').primaryKey(),
    hubId: text('hubId')
      .notNull()
      .references(() => hub.id, { onDelete: 'restrict' }),
    previousRevisionId: text('previousRevisionId'),
    changeSetId: text('changeSetId')
      .notNull()
      .references(() => revisionChangeSet.id),
    content: text('content', { mode: 'json' }).$type<RevisionValue>().notNull(),
    schemaVersion: integer('schemaVersion').notNull().default(1),
  },
  table => [
    unique('hub_revision_owner').on(table.hubId, table.id),
    foreignKey({
      columns: [table.hubId, table.previousRevisionId],
      foreignColumns: [table.hubId, table.id],
    }),
    check(
      'hub_revision_content',
      sql`json_valid(${table.content}) AND ${table.schemaVersion}=1`,
    ),
  ],
)

/** Admin edits immediately advance this head and the existing public projection together. */
export const hubRevisionHead = sqliteTable(
  'hubRevisionHead',
  {
    hubId: text('hubId')
      .primaryKey()
      .references(() => hub.id, { onDelete: 'restrict' }),
    currentRevisionId: text('currentRevisionId').notNull(),
    generation: integer('generation').notNull().default(0),
  },
  table => [
    foreignKey({
      columns: [table.hubId, table.currentRevisionId],
      foreignColumns: [hubRevision.hubId, hubRevision.id],
    }),
    check('hub_revision_generation', sql`${table.generation} >= 0`),
  ],
)

/** Transaction-local capture scope; successful and rolled-back commands leave no rows here. */
export const hubRevisionWrite = sqliteTable('hubRevisionWrite', {
  // Creation commands establish the scope before inserting the hub identity.
  hubId: text('hubId').primaryKey(),
  token: text('token').notNull(),
  revisionId: text('revisionId').notNull(),
  baselineRevisionId: text('baselineRevisionId').notNull(),
})
