// DRIZZLE
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Complete published catalogue plus retired definitions retained for existing references. */
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

/** Private pages of a release-pinned catalogue, published only after completeness checks. */
export const divisionCatalogueStage = sqliteTable('divisionCatalogueStage', {
  id: text('id').primaryKey(),
  apiReleaseSet: text('apiReleaseSet').notNull(),
  attributes: text('attributes', { mode: 'json' }).notNull(),
})

/** Exact polygon parts for catalogue definitions larger than a D1 row. */
export const divisionGeometryPart = sqliteTable(
  'divisionGeometryPart',
  {
    divisionId: text('divisionId')
      .notNull()
      .references(() => divisionDefinition.id, { onDelete: 'cascade' }),
    part: integer('part').notNull(),
    geometries: text('geometries', { mode: 'json' }).notNull(),
  },
  table => [primaryKey({ columns: [table.divisionId, table.part] })],
)

/** Private large polygon parts published atomically with catalogue metadata. */
export const divisionGeometryStage = sqliteTable(
  'divisionGeometryStage',
  {
    divisionId: text('divisionId').notNull(),
    part: integer('part').notNull(),
    geometries: text('geometries', { mode: 'json' }).notNull(),
  },
  table => [primaryKey({ columns: [table.divisionId, table.part] })],
)
