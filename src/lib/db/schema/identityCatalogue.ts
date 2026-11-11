// DRIZZLE
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
// TYPES
import type { IdentityCatalogueContent } from '#lib/locations/identityCatalogue.js'

/** Shared corporate groups and storefront brand families; never Location source facts. */
export const identityCatalogue = sqliteTable('identityCatalogue', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['brand', 'group'] }).notNull(),
  version: integer('version').notNull(),
})
/** Immutable localized catalogue evidence retained by community curation references. */
export const identityCatalogueRevision = sqliteTable(
  'identityCatalogueRevision',
  {
    catalogueId: text('catalogueId')
      .notNull()
      .references(() => identityCatalogue.id),
    version: integer('version').notNull(),
    content: text('content', { mode: 'json' })
      .$type<IdentityCatalogueContent>()
      .notNull(),
    actorId: text('actorId').notNull(),
    createdAt: text('createdAt').notNull(),
  },
  table => [primaryKey({ columns: [table.catalogueId, table.version] })],
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
