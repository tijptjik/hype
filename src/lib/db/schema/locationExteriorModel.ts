// DRIZZLE
import { sql } from 'drizzle-orm'
import { check, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { location } from './location'
// TYPES
import type { FloorLine } from '#lib/locations/exterior/floorAlignment.js'

/** Reviewed exterior model and the immutable object set associated with a Location. */
export const locationExteriorModel = sqliteTable('locationExteriorModel', {
  locationId: text('locationId')
    .primaryKey()
    .references(() => location.id, { onDelete: 'restrict' }),
  assetId: text('assetId').notNull(),
  sourceModelId: text('sourceModelId').notNull(),
  sourceSheet: text('sourceSheet').notNull(),
  actorId: text('actorId').notNull(),
  createdAt: text('createdAt').notNull(),
})

/** Append-only floor boundaries and front view for an exact exterior geometry. */
export const locationExteriorAlignment = sqliteTable(
  'locationExteriorAlignment',
  {
    locationId: text('locationId')
      .notNull()
      .references(() => location.id, { onDelete: 'restrict' }),
    assetId: text('assetId').notNull(),
    geometryId: text('geometryId').notNull(),
    revision: integer('revision').notNull(),
    alignment: text('alignment', { mode: 'json' })
      .$type<{ frontViewId: string; lines: FloorLine[] }>()
      .notNull(),
    actorId: text('actorId').notNull(),
    savedAt: text('savedAt').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.locationId, table.assetId, table.geometryId, table.revision],
    }),
    check('locationExteriorAlignment_positive_revision', sql`${table.revision}>0`),
    check('locationExteriorAlignment_valid_json', sql`json_valid(${table.alignment})`),
  ],
)
