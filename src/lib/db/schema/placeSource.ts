// DRIZZLE
import { sql } from 'drizzle-orm'
import {
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core'
// TYPES
import type { PlacePublication } from '#lib/places/publication.js'
import type {
  PlaceSourceInventory,
  PlaceSourceComparisonPlan,
} from '#lib/places/sourceInventory.js'
import type {
  PlaceSourceComparisonPin,
  PlaceSourceChangesPage,
} from '#lib/places/sourceChanges.js'

/** Independent publisher discovery and collection checkpoint for a canonical transition. */
export const placeSourceTransition = sqliteTable(
  'placeSourceTransition',
  {
    id: text('id').primaryKey(),
    fromPublication: text('fromPublication', {
      mode: 'json',
    }).$type<PlacePublication>(),
    toPublication: text('toPublication', { mode: 'json' })
      .$type<PlacePublication>()
      .notNull(),
    phase: text('phase', { enum: ['queued', 'collect', 'complete', 'review'] })
      .notNull()
      .default('queued'),
    inventories: text('inventories', { mode: 'json' }).$type<{
      before: PlaceSourceInventory | null
      after: PlaceSourceInventory
    }>(),
    plan: text('plan', { mode: 'json' }).$type<PlaceSourceComparisonPlan>(),
    lease: text('lease'),
    leaseUntil: integer('leaseUntil').notNull().default(0),
    failures: integer('failures').notNull().default(0),
    retryAt: integer('retryAt').notNull().default(0),
    lastError: text('lastError'),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  table => [
    index('place_source_transition_work').on(
      table.phase,
      table.retryAt,
      table.createdAt,
    ),
  ],
)

/** Publisher aliases resolve once; all resumed pages use the retained exact pin. */
export const placeSourceComparison = sqliteTable(
  'placeSourceComparison',
  {
    id: text('id').primaryKey(),
    transitionId: text('transitionId')
      .notNull()
      .references(() => placeSourceTransition.id, { onDelete: 'restrict' }),
    datasetCode: text('datasetCode').notNull(),
    resourceType: text('resourceType').notNull(),
    sourceVariant: text('sourceVariant').notNull(),
    fromRelease: text('fromRelease').notNull(),
    toRelease: text('toRelease').notNull(),
    pin: text('pin', { mode: 'json' }).$type<PlaceSourceComparisonPin>(),
    cursor: text('cursor'),
    pageNumber: integer('pageNumber').notNull().default(0),
    complete: integer('complete', { mode: 'boolean' }).notNull().default(false),
    added: integer('added').notNull().default(0),
    changed: integer('changed').notNull().default(0),
    removed: integer('removed').notNull().default(0),
  },
  table => [
    unique().on(table.transitionId, table.datasetCode, table.resourceType),
    index('place_source_comparison_work').on(
      table.transitionId,
      table.complete,
      table.id,
    ),
  ],
)

/** Immutable complete pages; SQL migration triggers prohibit update and deletion. */
export const placeSourcePage = sqliteTable(
  'placeSourcePage',
  {
    comparisonId: text('comparisonId')
      .notNull()
      .references(() => placeSourceComparison.id, { onDelete: 'restrict' }),
    pageNumber: integer('pageNumber').notNull(),
    requestCursor: text('requestCursor').notNull(),
    nextCursor: text('nextCursor'),
    evidence: text('evidence', { mode: 'json' })
      .$type<PlaceSourceChangesPage>()
      .notNull(),
  },
  table => [
    primaryKey({ columns: [table.comparisonId, table.pageNumber] }),
    unique().on(table.comparisonId, table.requestCursor),
    unique().on(table.comparisonId, table.nextCursor),
  ],
)

/** Cross-page source identity uniqueness is committed atomically with each page. */
export const placeSourceEvidenceId = sqliteTable(
  'placeSourceEvidenceId',
  {
    comparisonId: text('comparisonId').notNull(),
    sourceRecordId: text('sourceRecordId').notNull(),
    pageNumber: integer('pageNumber').notNull(),
  },
  table => [
    primaryKey({ columns: [table.comparisonId, table.sourceRecordId] }),
    foreignKey({
      columns: [table.comparisonId, table.pageNumber],
      foreignColumns: [placeSourcePage.comparisonId, placeSourcePage.pageNumber],
    }).onDelete('restrict'),
  ],
)
