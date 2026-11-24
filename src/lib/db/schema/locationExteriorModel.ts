// DRIZZLE
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { location } from './location'

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
