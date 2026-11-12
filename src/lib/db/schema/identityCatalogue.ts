// DRIZZLE
import { sql } from 'drizzle-orm'
import {
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
// TYPES
import type { IdentityCatalogueContent } from '#lib/locations/identityCatalogue.js'

/** Shared corporate groups and storefront brand families; never Location source facts. */
export const identityCatalogue = sqliteTable('identityCatalogue', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['brand', 'group'] }).notNull(),
  version: integer('version').notNull(),
})
/** Immutable localized catalogue evidence retained by community curation references. */
export const identityCatalogueRevisionStorage = sqliteTable(
  'identityCatalogueRevision',
  {
    catalogueId: text('catalogueId')
      .notNull()
      .references(() => identityCatalogue.id),
    version: integer('version').notNull(),
    content: text('content', { mode: 'json' })
      .$type<Omit<IdentityCatalogueContent, 'i18n'>>()
      .notNull(),
    actorId: text('actorId').notNull(),
    createdAt: text('createdAt').notNull(),
  },
  table => [primaryKey({ columns: [table.catalogueId, table.version] })],
)
/** Assembled input/read view; writes split content and immutable locale rows atomically. */
export const identityCatalogueRevision = sqliteTable(
  'identityCatalogueRevisionContent',
  {
    catalogueId: text('catalogueId').notNull(),
    version: integer('version').notNull(),
    content: text('content', { mode: 'json' })
      .$type<IdentityCatalogueContent>()
      .notNull(),
    actorId: text('actorId').notNull(),
    createdAt: text('createdAt').notNull(),
  },
)
/** Stable upstream identity mapping; imports cannot replace curated translations. */
export const identityCatalogueSource = sqliteTable(
  'identityCatalogueSource',
  {
    source: text('source').notNull(),
    sourceId: text('sourceId').notNull(),
    catalogueId: text('catalogueId')
      .notNull()
      .references(() => identityCatalogue.id),
  },
  table => [primaryKey({ columns: [table.source, table.sourceId] })],
)

/** Sole storage of translated names, pinned to their immutable catalogue revision. */
export const identityCatalogueI18n = sqliteTable(
  'identityCatalogueI18n',
  {
    catalogueId: text('catalogueId')
      .notNull()
      .references(() => identityCatalogue.id),
    version: integer('version').notNull(),
    locale: text('locale').notNull(),
    name: text('name').notNull(),
  },
  table => [
    primaryKey({ columns: [table.catalogueId, table.version, table.locale] }),
    foreignKey({
      columns: [table.catalogueId, table.version],
      foreignColumns: [
        identityCatalogueRevisionStorage.catalogueId,
        identityCatalogueRevisionStorage.version,
      ],
    }),
    index('identity_catalogue_i18n_name').on(
      sql`${table.name} COLLATE NOCASE`,
      table.catalogueId,
      table.version,
    ),
  ],
)
