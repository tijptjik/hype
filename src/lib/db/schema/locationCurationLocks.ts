// DRIZZLE
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { location } from './location'
// TYPES
import type { CurationOpenFields } from '#lib/locations/curationLocks.js'
/** Append-only lock administration; migration 0232 enforces scoped heads and immutable history. */
export const locationCurationLockRevision = sqliteTable(
  'locationCurationLockRevision',
  {
    id: text('id').primaryKey().notNull(),
    locationId: text('locationId')
      .notNull()
      .references(() => location.id),
    previousRevisionId: text('previousRevisionId'),
    openFields: text('openFields', { mode: 'json' })
      .$type<CurationOpenFields>()
      .notNull(),
    actorId: text('actorId').notNull(),
    createdAt: text('createdAt').notNull(),
  },
)
