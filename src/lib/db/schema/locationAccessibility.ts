// DRIZZLE
import { sql } from 'drizzle-orm'
import { sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { location, locationRevisionStorage } from './location'
// TYPES
import type { Accessibility } from '#lib/locations/accessibility.js'

/** Append-only shared accessibility facts; migration guards enforce the revision chain. */
export const locationAccessibility = sqliteTable(
  'locationAccessibility',
  {
    id: text('id').primaryKey(),
    locationId: text('locationId')
      .notNull()
      .references(() => location.id),
    previousRevisionId: text('previousRevisionId'),
    locationRevisionId: text('locationRevisionId')
      .notNull()
      .references(() => locationRevisionStorage.id),
    placementKey: text('placementKey').notNull(),
    valuesJson: text('valuesJson', { mode: 'json' }).$type<Accessibility>().notNull(),
    actorId: text('actorId').notNull(),
    recordedAt: text('recordedAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  t => [
    uniqueIndex('location_accessibility_root')
      .on(t.locationId)
      .where(sql`${t.previousRevisionId} IS NULL`),
    uniqueIndex('location_accessibility_successor')
      .on(t.previousRevisionId)
      .where(sql`${t.previousRevisionId} IS NOT NULL`),
    index('location_accessibility_subject').on(t.locationId),
  ],
)
