// DRIZZLE
import { foreignKey, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { featureRevision } from './featureRevision'
import { feature } from './feature'

/** Approved private projection changes are historical evidence, never publication receipts. */
export const featurePrivateCapture = sqliteTable('featurePrivateCapture', {
  sequence: integer('sequence').primaryKey({ autoIncrement: true }),
  featureId: text('featureId').notNull().references(() => feature.id), revisionId: text('revisionId').notNull().unique(), generation: integer('generation').notNull(),
}, table => [foreignKey({ columns:[table.featureId,table.revisionId],foreignColumns:[featureRevision.featureId,featureRevision.id] }),
  index('feature_private_capture_head').on(table.featureId,table.generation,table.sequence)])
