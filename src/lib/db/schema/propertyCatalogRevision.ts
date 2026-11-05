// DRIZZLE
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core'
// SCHEMA
import { revisionChangeSet } from './featureRevision'
// TYPES
import type { RevisionValue } from '#lib/revisions/merge.js'

/** Immutable owned field definitions, translations and option ordering, including removed identities. */
export const propertyCatalogRevision = sqliteTable(
  'propertyCatalogRevision',
  {
    id: text('id').primaryKey(),
    scope: text('scope', { enum: ['organisation', 'project', 'hub'] }).notNull(),
    resourceId: text('resourceId').notNull(),
    previousRevisionId: text('previousRevisionId'),
    changeSetId: text('changeSetId')
      .notNull()
      .references(() => revisionChangeSet.id),
    content: text('content', { mode: 'json' }).$type<RevisionValue>().notNull(),
  },
  table => [
    unique('property_catalog_revision_owner').on(
      table.scope,
      table.resourceId,
      table.id,
    ),
    foreignKey({
      columns: [table.scope, table.resourceId, table.previousRevisionId],
      foreignColumns: [table.scope, table.resourceId, table.id],
    }),
    check('property_catalog_content', sql`json_valid(${table.content})`),
    check(
      'property_catalog_scope',
      sql`${table.scope} IN ('organisation','project','hub')`,
    ),
  ],
)

/** Current catalogue projection; retained independently of individual field deletion. */
export const propertyCatalogRevisionHead = sqliteTable(
  'propertyCatalogRevisionHead',
  {
    scope: text('scope').notNull(),
    resourceId: text('resourceId').notNull(),
    currentRevisionId: text('currentRevisionId').notNull(),
    generation: integer('generation').notNull().default(0),
  },
  table => [
    primaryKey({ columns: [table.scope, table.resourceId] }),
    foreignKey({
      columns: [table.scope, table.resourceId, table.currentRevisionId],
      foreignColumns: [
        propertyCatalogRevision.scope,
        propertyCatalogRevision.resourceId,
        propertyCatalogRevision.id,
      ],
    }),
    check('property_catalog_generation', sql`${table.generation}>=0`),
  ],
)

/** Transaction-local guard, cleared before successful commit or by rollback. */
export const propertyCatalogRevisionWrite = sqliteTable(
  'propertyCatalogRevisionWrite',
  {
    scope: text('scope').notNull(),
    resourceId: text('resourceId').notNull(),
    token: text('token').notNull(),
  },
  table => [primaryKey({ columns: [table.scope, table.resourceId] })],
)
