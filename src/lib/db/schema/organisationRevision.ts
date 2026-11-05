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
import { organisation } from './organisation'
import { revisionChangeSet } from './featureRevision'
// TYPES
import type { RevisionValue } from '#lib/revisions/merge.js'

/** Immutable organisation profile/configuration evidence; permissions are not restored from it. */
export const organisationRevision = sqliteTable(
  'organisationRevision',
  {
    id: text('id').primaryKey(),
    organisationId: text('organisationId')
      .notNull()
      .references(() => organisation.id, { onDelete: 'restrict' }),
    previousRevisionId: text('previousRevisionId'),
    changeSetId: text('changeSetId')
      .notNull()
      .references(() => revisionChangeSet.id),
    content: text('content', { mode: 'json' }).$type<RevisionValue>().notNull(),
    schemaVersion: integer('schemaVersion').notNull().default(1),
  },
  table => [
    unique('organisation_revision_owner').on(table.organisationId, table.id),
    foreignKey({
      columns: [table.organisationId, table.previousRevisionId],
      foreignColumns: [table.organisationId, table.id],
    }),
    check(
      'organisation_revision_content',
      sql`json_valid(${table.content}) AND ${table.schemaVersion}=1`,
    ),
  ],
)

/** Admin edits immediately advance this head and the existing public projection together. */
export const organisationRevisionHead = sqliteTable(
  'organisationRevisionHead',
  {
    organisationId: text('organisationId')
      .primaryKey()
      .references(() => organisation.id, { onDelete: 'restrict' }),
    currentRevisionId: text('currentRevisionId').notNull(),
    generation: integer('generation').notNull().default(0),
  },
  table => [
    foreignKey({
      columns: [table.organisationId, table.currentRevisionId],
      foreignColumns: [organisationRevision.organisationId, organisationRevision.id],
    }),
    check('organisation_revision_generation', sql`${table.generation} >= 0`),
  ],
)

/** Transaction-local capture scope; successful and rolled-back commands leave no rows here. */
export const organisationRevisionWrite = sqliteTable('organisationRevisionWrite', {
  // Creation commands establish the scope before inserting the organisation identity.
  organisationId: text('organisationId').primaryKey(),
  token: text('token').notNull(),
  revisionId: text('revisionId').notNull(),
  baselineRevisionId: text('baselineRevisionId').notNull(),
})
