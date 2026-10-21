// DRIZZLE
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core'
// TYPES
import type { PlacePublication } from '#lib/locations/publication.js'
import type { SaanSeoiPlaceProjection } from '#lib/locations/saanseoi.js'

/** Singleton monthly discovery, pinned scan progress and exclusive worker ownership. */
export const locationRefresh = sqliteTable('locationRefresh', {
  id: integer('id').primaryKey(),
  phase: text('phase', { enum: ['idle', 'scan', 'ready', 'review'] })
    .notNull()
    .default('idle'),
  accepted: text('accepted', { mode: 'json' }).$type<PlacePublication>(),
  target: text('target', { mode: 'json' }).$type<PlacePublication>(),
  runId: text('runId'),
  checkedMonth: text('checkedMonth'),
  nextOffset: integer('nextOffset').notNull().default(0),
  total: integer('total'),
  lease: text('lease'),
  leaseUntil: integer('leaseUntil').notNull().default(0),
  retryAt: integer('retryAt').notNull().default(0),
  failures: integer('failures').notNull().default(0),
  lastError: text('lastError'),
  scanMode: text('scanMode', { enum: ['catalogue', 'identities'] })
    .notNull()
    .default('catalogue'),
})

/** Run-local source evidence survives reassociation or deletion of a Feature. */
export const locationRefreshItem = sqliteTable(
  'locationRefreshItem',
  {
    runId: text('runId').notNull(),
    locationId: text('locationId').notNull(),
    ssId: text('ssId').notNull(),
    sourceOffset: integer('sourceOffset'),
    revisionId: text('revisionId'),
    featureCursor: text('featureCursor').notNull().default(''),
    outcomes: text('outcomes', { mode: 'json' })
      .$type<
        Record<
          string,
          {
            projectId: string
            proposalId?: string | null
            reason?: string | null
            outcome: 'processed' | 'review' | 'conflict' | 'unlinked'
            geometryChanged: number
          }
        >
      >()
      .notNull()
      .default({}),
    reviewReason: text('reviewReason'),
    projection: text('projection', { mode: 'json' }).$type<SaanSeoiPlaceProjection>(),
    status: text('status', { enum: ['missing', 'pending', 'processed', 'review'] })
      .notNull()
      .default('missing'),
  },
  table => [
    primaryKey({ columns: [table.runId, table.locationId] }),
    unique().on(table.runId, table.ssId),
    index('location_refresh_item_work').on(table.runId, table.status, table.locationId),
  ],
)
