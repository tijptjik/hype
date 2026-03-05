import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
// SCHEMA
import { organisation } from './organisation'
import { project } from './project'
import { user } from './user'
import { property } from './property'
// ENUM
import { supportedLocales } from '../../enums'
// TYPES
import type { LayerMetadata } from '../../types'

/* ============================================================================
 * LAYER MANAGEMENT
 * ============================================================================
 * Tables for managing map layers and their properties
 */

/**
 * Core layer table
 * @remarks
 * Stores layer information and metadata
 * - Basic info (name, description, etc.)
 * - Project reference
 * - Publication status
 * - Default visibility settings
 */
export const layer = sqliteTable('layer', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  organisationId: text('organisationId')
    .notNull()
    .references(() => organisation.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  projectId: text('projectId')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  // Additional Information
  metadata: text('metadata', { mode: 'json' }).$type<LayerMetadata>(),
  // Is this layer enabled for new users by default?
  isDefaultVisible: integer('isDefaultVisible', { mode: 'boolean' })
    .notNull()
    .default(false),
  // Accessible to the public in the app
  isPublished: integer('isPublished', { mode: 'boolean' }).notNull().default(false),
  localIsPublished: integer('localIsPublished', { mode: 'boolean' }),
  publishedAt: text('publishedAt'),
  publisherId: text('publisherId').references(() => user.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
  }),
  // False : Layer may be shown in the Admin Panel
  // True : Layer is considered deleted
  isArchived: integer('isArchived', { mode: 'boolean' }).notNull().default(false),
  localIsArchived: integer('localIsArchived', { mode: 'boolean' }),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull(),
})

/**
 * Layer translations
 * @remarks
 * Stores multilingual content for layers
 */
export const layerI18n = sqliteTable(
  'layerI18n',
  {
    layerId: text('layerId')
      .notNull()
      .references(() => layer.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    locale: text('locale', {
      enum: supportedLocales as [string, ...string[]],
    }).notNull(),
    // Full Name in {locale}
    name: text('name').notNull(),
    nameGen: integer('nameGen', { mode: 'boolean' }).notNull().default(true),
    // Short Name  in {locale}, used in navigation
    nameShort: text('nameShort').notNull(),
    nameShortGen: integer('nameShortGen', { mode: 'boolean' }).notNull().default(true),
    // Description in {locale}
    description: text('description'),
    descriptionGen: integer('descriptionGen', { mode: 'boolean' })
      .notNull()
      .default(true),
  },
  table => [primaryKey({ columns: [table.layerId, table.locale] })],
)

/**
 * Layer property assignments
 * @remarks
 * Links properties to layers with visibility settings
 */
export const layerProperty = sqliteTable('layerProperty', {
  layerId: text('layerId')
    .notNull()
    .references(() => layer.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  propertyId: text('propertyId')
    .notNull()
    .references(() => property.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  isVisible: integer('isVisible', { mode: 'boolean' }).notNull().default(true),
  isUserContributable: integer('isUserContributed', { mode: 'boolean' })
    .notNull()
    .default(true),
})
