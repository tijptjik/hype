// DRIZZLE
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { user } from './user'

/** Versioned editorial defaults; ancestry is checked inside each settings transaction. */
export const featureIntentPolicy = sqliteTable(
  'featureIntentPolicy',
  {
    scopeType: text('scopeType').notNull(),
    scopeId: text('scopeId').notNull(),
    definition: text('definition'),
    version: integer('version').notNull(),
    actorId: text('actorId')
      .notNull()
      .references(() => user.id),
  },
  table => [primaryKey({ columns: [table.scopeType, table.scopeId] })],
)

/** Append-only policy evidence. Features retain their own accepted content history. */
export const featureIntentPolicyRevision = sqliteTable('featureIntentPolicyRevision', {
  id: text('id').primaryKey(),
  scopeType: text('scopeType').notNull(),
  scopeId: text('scopeId').notNull(),
  definition: text('definition'),
  version: integer('version').notNull(),
  actorId: text('actorId')
    .notNull()
    .references(() => user.id),
  createdAt: text('createdAt').notNull(),
})
