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
import { project } from './project'
import { revisionChangeSet } from './featureRevision'
// TYPES
import type { RevisionValue } from '#lib/revisions/merge.js'

/** Immutable project profile/configuration evidence; permissions are not restored from it. */
export const projectRevision = sqliteTable(
  'projectRevision',
  {
    id: text('id').primaryKey(),
    projectId: text('projectId')
      .notNull()
      .references(() => project.id, { onDelete: 'restrict' }),
    previousRevisionId: text('previousRevisionId'),
    changeSetId: text('changeSetId')
      .notNull()
      .references(() => revisionChangeSet.id),
    content: text('content', { mode: 'json' }).$type<RevisionValue>().notNull(),
    schemaVersion: integer('schemaVersion').notNull().default(1),
  },
  table => [
    unique('project_revision_owner').on(table.projectId, table.id),
    foreignKey({
      columns: [table.projectId, table.previousRevisionId],
      foreignColumns: [table.projectId, table.id],
    }),
    check(
      'project_revision_content',
      sql`json_valid(${table.content}) AND ${table.schemaVersion}=1`,
    ),
  ],
)

/** Admin edits immediately advance this head and the existing public projection together. */
export const projectRevisionHead = sqliteTable(
  'projectRevisionHead',
  {
    projectId: text('projectId')
      .primaryKey()
      .references(() => project.id, { onDelete: 'restrict' }),
    currentRevisionId: text('currentRevisionId').notNull(),
    generation: integer('generation').notNull().default(0),
  },
  table => [
    foreignKey({
      columns: [table.projectId, table.currentRevisionId],
      foreignColumns: [projectRevision.projectId, projectRevision.id],
    }),
    check('project_revision_generation', sql`${table.generation} >= 0`),
  ],
)

/** Transaction-local capture scope; successful and rolled-back commands leave no rows here. */
export const projectRevisionWrite = sqliteTable('projectRevisionWrite', {
  // Creation commands establish the scope before inserting the project identity.
  projectId: text('projectId').primaryKey(),
  token: text('token').notNull(),
  revisionId: text('revisionId').notNull(),
  baselineRevisionId: text('baselineRevisionId').notNull(),
})
