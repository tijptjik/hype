// DRIZZLE
import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Stable division identities with the latest imported classification and labels. */
export const divisionDefinition = sqliteTable('divisionDefinition', {
  id: text('id').primaryKey(),
  apiReleaseSet: text('apiReleaseSet').notNull(),
  attributes: text('attributes', { mode: 'json' }).notNull(),
})

/** Localized source names and variants, owned by the division mirror. */
export const divisionI18n = sqliteTable(
  'divisionI18n',
  {
    divisionId: text('divisionId')
      .notNull()
      .references(() => divisionDefinition.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    locale: text('locale').notNull(),
    name: text('name'),
    namedValues: text('namedValues', { mode: 'json' })
      .$type<{
        name: string | null
        nameVariant?: string[] | null
        nameAlts?: string[] | null
        nameRules?: unknown[] | null
      }>()
      .notNull(),
  },
  table => [
    primaryKey({ columns: [table.divisionId, table.locale] }),
    index('division_i18n_name').on(table.locale, table.name, table.divisionId),
  ],
)
