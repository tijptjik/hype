// DRIZZLE
import { sql } from 'drizzle-orm'
import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { locationRevision } from './location'

/** Searchable translations projected atomically from normalized Location revision content. */
export const locationRevisionI18n = sqliteTable(
  'locationRevisionI18n',
  {
    revisionId: text('revisionId')
      .notNull()
      .references(() => locationRevision.id),
    locale: text('locale').notNull(),
    name: text('name'),
    branch: text('branch'),
    format: text('format'),
    displayAddress: text('displayAddress'),
    displayAddressOverride: text('displayAddressOverride'),
  },
  table => [
    primaryKey({ columns: [table.revisionId, table.locale] }),
    index('location_revision_i18n_name').on(
      sql`${table.name} COLLATE NOCASE`,
      table.revisionId,
    ),
    index('location_revision_i18n_branch').on(
      sql`${table.branch} COLLATE NOCASE`,
      table.revisionId,
    ),
  ],
)
