// DRIZZLE
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Server-owned idle windows; absent rows represent permanently frozen legacy history. */
export const revisionEditWindow = sqliteTable(
  'revisionEditWindow',
  {
    resource: text('resource').notNull(),
    revisionId: text('revisionId').notNull(),
    actorId: text('actorId').notNull(),
    origin: text('origin').notNull(),
    lastEditedAt: integer('lastEditedAt').notNull(),
    closedAt: integer('closedAt'),
  },
  table => [primaryKey({ columns: [table.resource, table.revisionId] })],
)

/** Transaction-local selection for single-resource captures. */
export const revisionEditSelection = sqliteTable('revisionEditSelection', {
  token: text('token').primaryKey(),
  revisionId: text('revisionId').notNull(),
})
