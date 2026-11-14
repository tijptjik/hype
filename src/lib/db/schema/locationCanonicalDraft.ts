// DRIZZLE
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
// SCHEMA
import { location } from './location'

/** Stable submission correlation, retained after upstream assigns its canonical identity. */
export const locationCanonicalDraft = sqliteTable('locationCanonicalDraft', {
  locationId: text('locationId')
    .primaryKey()
    .references(() => location.id, { onDelete: 'restrict' }),
  sourceKey: text('sourceKey').unique().notNull(),
  createdBy: text('createdBy').notNull(),
  createdAt: text('createdAt')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
})
