// DRIZZLE
import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { feature } from './feature'
import { location, locationIdentityReview } from './location'

/** Publication discovery and lease ownership, independent from source-linked refresh cursors. */
export const locationRematchRun = sqliteTable('locationRematchRun', {
  id: integer('id').primaryKey(),
  publication: text('publication'),
  generation: integer('generation').notNull().default(0),
  cursor: text('cursor').notNull().default(''),
  scanning: integer('scanning').notNull().default(0),
  checkedAt: integer('checkedAt').notNull().default(0),
  lease: text('lease'),
  leaseUntil: integer('leaseUntil').notNull().default(0),
  failures: integer('failures').notNull().default(0),
  retryAt: integer('retryAt').notNull().default(0),
  lastError: text('lastError'),
})

/** Durable Feature-specific intent and bounded candidate lookup checkpoint. */
export const locationRematchJob = sqliteTable(
  'locationRematchJob',
  {
    id: text('id').primaryKey(),
    featureId: text('featureId')
      .notNull()
      .references(() => feature.id, { onDelete: 'cascade' }),
    projectId: text('projectId').notNull(),
    locationId: text('locationId')
      .notNull()
      .references(() => location.id),
    intent: text('intent').notNull(),
    baseline: text('baseline').notNull(),
    publication: text('publication').notNull(),
    generation: integer('generation').notNull(),
    status: text('status', {
      enum: [
        'pending',
        'checking',
        'matched',
        'ambiguous',
        'deferred',
        'failed',
        'suppressed',
      ],
    })
      .notNull()
      .default('pending'),
    candidates: text('candidates'),
    candidateCursor: integer('candidateCursor').notNull().default(0),
    incomplete: integer('incomplete').notNull().default(1),
    reason: text('reason'),
    attempts: integer('attempts').notNull().default(0),
    retryAt: integer('retryAt').notNull().default(0),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  table => [
    unique().on(table.featureId, table.intent),
    index('location_rematch_work').on(
      table.generation,
      table.status,
      table.retryAt,
      table.id,
    ),
  ],
)

/** Immutable candidate receipt; decisions use the existing identity review lifecycle. */
export const locationRematchReview = sqliteTable(
  'locationRematchReview',
  {
    reviewId: text('reviewId')
      .primaryKey()
      .references(() => locationIdentityReview.id),
    jobId: text('jobId')
      .notNull()
      .references(() => locationRematchJob.id, { onDelete: 'cascade' }),
    generation: integer('generation').notNull(),
    ssId: text('ssId').notNull(),
    evidence: text('evidence').notNull(),
  },
  table => [unique().on(table.jobId, table.generation, table.ssId)],
)
