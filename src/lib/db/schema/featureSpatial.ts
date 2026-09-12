// DRIZZLE
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
// SCHEMA
import { feature } from './feature'

/** Materialized H3 membership, maintained by feature geometry/index triggers. */
export const featureSpatial = sqliteTable(
  'featureSpatial',
  {
    featureId: text('featureId')
      .notNull()
      .references(() => feature.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    resolution: integer('resolution').notNull(),
    cell: text('cell').notNull(),
    layerId: text('layerId').notNull(),
    longitude: real('longitude').notNull(),
    latitude: real('latitude').notNull(),
  },
  table => [
    primaryKey({ columns: [table.featureId, table.resolution] }),
    index('featureSpatial_cell_layer_idx').on(
      table.resolution,
      table.cell,
      table.layerId,
      table.featureId,
    ),
  ],
)
