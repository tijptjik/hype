// DRIZZLE
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { feature } from './feature'

/** Singleton release checkpoint and fenced ownership for the scheduled worker. */
export const divisionRefresh = sqliteTable('divisionRefresh', {
  id: integer('id').primaryKey(),
  appliedRelease: text('appliedRelease'),
  targetRelease: text('targetRelease'),
  targetReleaseId: text('targetReleaseId'),
  comparisonId: text('comparisonId'),
  cursor: text('cursor'),
  phase: text('phase', { enum: ['idle', 'changes', 'scan', 'geocode'] })
    .notNull()
    .default('idle'),
  checkedMonth: text('checkedMonth'),
  lease: text('lease'),
  leaseUntil: integer('leaseUntil').notNull().default(0),
  lastError: text('lastError'),
})

/** Pinned changes waiting for bounded local spatial/dependency scans. */
export const divisionRefreshChange = sqliteTable('divisionRefreshChange', {
  id: text('id').primaryKey(),
  payload: text('payload').notNull(),
  featureCursor: text('featureCursor').notNull().default(''),
})

/** Source coordinates and release accompany every authoritative resolution. */
export const featureDivisionResolution = sqliteTable('featureDivisionResolution', {
  featureId: text('featureId')
    .primaryKey()
    .references(() => feature.id, {
      onDelete: 'cascade',
      onUpdate: 'cascade',
    }),
  apiReleaseSet: text('apiReleaseSet').notNull(),
  geometry: text('geometry').notNull(),
  status: text('status').notNull(),
  result: text('result', { mode: 'json' }).notNull(),
})

/** Candidate IDs permit future invalidation; only selected entries contribute counts. */
export const featureDivisionMembership = sqliteTable(
  'featureDivisionMembership',
  {
    featureId: text('featureId')
      .notNull()
      .references(() => feature.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    divisionId: text('divisionId').notNull(),
    selected: integer('selected', { mode: 'boolean' }).notNull(),
  },
  table => [
    primaryKey({ columns: [table.featureId, table.divisionId] }),
    index('feature_division_membership_division').on(table.divisionId, table.featureId),
  ],
)

/** Durable generations protect coordinate edits and retries from stale remote results. */
export const featureDivisionJob = sqliteTable(
  'featureDivisionJob',
  {
    featureId: text('featureId')
      .primaryKey()
      .references(() => feature.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    generation: integer('generation').notNull().default(1),
    attempts: integer('attempts').notNull().default(0),
    retryAt: integer('retryAt').notNull().default(0),
    lastError: text('lastError'),
  },
  table => [index('feature_division_job_retry').on(table.retryAt, table.featureId)],
)
