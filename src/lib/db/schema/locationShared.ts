// DRIZZLE
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
// SCHEMA
import { location, locationRevisionStorage } from './location'
// TYPES
import type { SharedCorrections } from '#lib/locations/sharedCorrection.js'
/** Append-only shared corrections; migration triggers enforce one scoped history chain. */
export const locationSharedRevision = sqliteTable('locationSharedRevision', {
  id: text('id').primaryKey().notNull(),
  locationId: text('locationId')
    .notNull()
    .references(() => location.id),
  previousRevisionId: text('previousRevisionId'),
  sourceRevisionId: text('sourceRevisionId')
    .notNull()
    .references(() => locationRevisionStorage.id),
  corrections: text('corrections', { mode: 'json' })
    .$type<SharedCorrections>()
    .notNull(),
  actorId: text('actorId').notNull(),
  provenance: text('provenance', { mode: 'json' })
    .$type<Record<string, unknown>>()
    .notNull(),
  createdAt: text('createdAt')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
})
