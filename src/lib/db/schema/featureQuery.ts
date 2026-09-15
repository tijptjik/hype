// DRIZZLE
import {
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core'
// SCHEMA
import { feature, featureI18n } from './feature'

/** Stable FTS document identities; searchable values remain owned by featureI18n. */
export const featureSearchDocument = sqliteTable(
  'featureSearchDocument',
  {
    id: integer('id').primaryKey(),
    featureId: text('featureId')
      .notNull()
      .references(() => feature.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    locale: text('locale').notNull(),
  },
  table => [
    unique('feature_search_document_translation_unique').on(
      table.featureId,
      table.locale,
    ),
    foreignKey({
      columns: [table.featureId, table.locale],
      foreignColumns: [featureI18n.featureId, featureI18n.locale],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
)

// featureSearchFts is a contentless FTS5 virtual table owned by migration 0081.
// Keeping it out of sqliteTable metadata prevents ordinary-table DDL generation.
