// DRIZZLE
import { sql } from 'drizzle-orm'
import { check, sqliteTable, text } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { featureRevisionHead, featureRevisionPublication } from './featureRevision'

/** Retained legacy contribution/review evidence; distinct from the enrollment job's actor.
 * @remarks User and task IDs deliberately survive deletion of their live records.
 * SQL enrollment triggers freeze this evidence; the application never updates it.
 */
export const featureBaselineAttribution = sqliteTable(
  'featureBaselineAttribution',
  {
    featureId: text('featureId')
      .primaryKey()
      .references(() => featureRevisionHead.featureId, { onDelete: 'restrict' }),
    publicationId: text('publicationId')
      .notNull()
      .unique()
      .references(() => featureRevisionPublication.id, { onDelete: 'restrict' }),
    contributorId: text('contributorId'),
    reviewerId: text('reviewerId'),
    taskId: text('taskId'),
    basis: text('basis', {
      enum: ['reviewed-task', 'task-contribution', 'direct-contribution'],
    }).notNull(),
    recordedAt: text('recordedAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  table => [
    check(
      'feature_baseline_actor',
      sql`${table.contributorId} IS NOT NULL OR ${table.reviewerId} IS NOT NULL`,
    ),
    check(
      'feature_baseline_basis',
      sql`${table.basis} IN ('reviewed-task','task-contribution','direct-contribution')`,
    ),
    check(
      'feature_baseline_evidence',
      sql`(${table.basis}='direct-contribution' AND ${table.taskId} IS NULL AND ${table.reviewerId} IS NULL)
    OR (${table.basis}='task-contribution' AND ${table.taskId} IS NOT NULL AND ${table.reviewerId} IS NULL)
    OR (${table.basis}='reviewed-task' AND ${table.taskId} IS NOT NULL AND ${table.reviewerId} IS NOT NULL)`,
    ),
  ],
)
