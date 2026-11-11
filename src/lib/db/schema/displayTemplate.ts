// DRIZZLE
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  foreignKey,
} from 'drizzle-orm/sqlite-core'
// SCHEMA
import { organisation } from './organisation'
import { user } from './user'
import { feature } from './feature'
// TYPES
import type { DisplayTemplateDefinition } from '#lib/templates/registry.js'

/** Central identity; versions are retained separately and assignments pin a version. */
export const displayTemplate = sqliteTable('displayTemplate', {
  id: text('id').primaryKey(),
  organisationId: text('organisationId').references(() => organisation.id),
  code: text('code').notNull(),
  version: integer('version').notNull(),
})

/** Immutable authored expressions in each content locale. */
export const displayTemplateRevision = sqliteTable(
  'displayTemplateRevision',
  {
    templateId: text('templateId')
      .notNull()
      .references(() => displayTemplate.id),
    version: integer('version').notNull(),
    definition: text('definition', { mode: 'json' })
      .notNull()
      .$type<DisplayTemplateDefinition>(),
    actorId: text('actorId')
      .notNull()
      .references(() => user.id),
    createdAt: text('createdAt').notNull(),
  },
  table => [primaryKey({ columns: [table.templateId, table.version] })],
)

/** Generated display values are projections, separate from authored Feature translations. */
export const featureDisplayTemplateOutput = sqliteTable(
  'featureDisplayTemplateOutput',
  {
    featureId: text('featureId')
      .notNull()
      .references(() => feature.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    templateId: text('templateId').notNull(),
    templateVersion: integer('templateVersion').notNull(),
    title: text('title').notNull(),
  },
  table => [
    primaryKey({ columns: [table.featureId, table.locale] }),
    foreignKey({
      columns: [table.templateId, table.templateVersion],
      foreignColumns: [
        displayTemplateRevision.templateId,
        displayTemplateRevision.version,
      ],
    }),
  ],
)
