import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
// SCHEMA
import { hub } from './hub'
import { project } from './project'
// ENUM
import {
  FieldDiscriminator,
  PropertyComponentType,
  PropertyScope,
  supportedLocales,
} from '../../enums'

/* ============================================================================
 * PROPERTY MANAGEMENT
 * ============================================================================
 * Tables for managing properties and their values
 */

/**
 * Core property table
 * @remarks
 * Stores property definitions and metadata
 * - Property type (classifier/specifier/display)
 * - Component type for UI rendering
 * - Min/max values for numeric properties
 */
export const property = sqliteTable('property', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  projectId: text('projectId').references(() => project.id, {
    onDelete: 'cascade',
    onUpdate: 'cascade',
  }),
  hubId: text('hubId').references(() => hub.id, {
    onDelete: 'cascade',
    onUpdate: 'cascade',
  }),
  scope: text('scope', {
    enum: Object.values(PropertyScope) as [string, ...string[]],
  })
    .notNull()
    .default(PropertyScope.project),
  type: text('type', {
    enum: Object.values(FieldDiscriminator) as [string, ...string[]],
  })
    .notNull()
    .default(FieldDiscriminator.classifier),
  key: text('key').notNull(),
  isTranslatable: integer('isTranslatable', { mode: 'boolean' })
    .notNull()
    .default(true),
  rank: integer('rank').notNull().default(0),
  component: text('component', {
    enum: Object.values(PropertyComponentType) as [string, ...string[]],
  })
    .notNull()
    .default(PropertyComponentType.SelectField),
  min: integer('min'),
  max: integer('max'),
  isUserContributable: integer('isUserContributable', { mode: 'boolean' })
    .notNull()
    .default(true),
  isDefaultEnabled: integer('isDefaultEnabled', { mode: 'boolean' })
    .notNull()
    .default(false),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull(),
})

/**
 * Project property assignments
 * @remarks
 * Links projects to global properties they have opted into.
 * `rank` controls the display order of assigned global properties within the project.
 */
export const projectProperty = sqliteTable(
  'projectProperty',
  {
    projectId: text('projectId')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    propertyId: text('propertyId')
      .notNull()
      .references(() => property.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    rank: integer('rank').notNull().default(0),
  },
  table => [primaryKey({ columns: [table.projectId, table.propertyId] })],
)

/**
 * Property translations
 * @remarks
 * Stores multilingual content for properties
 */
export const propertyI18n = sqliteTable('propertyI18n', {
  propertyId: text('propertyId')
    .notNull()
    .references(() => property.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  locale: text('locale', { enum: supportedLocales as [string, ...string[]] }).notNull(),
  // Label in {locale}
  label: text('label').notNull(),
  labelGen: integer('labelGen', { mode: 'boolean' }).notNull().default(true),
  // Placeholder in {locale}
  placeholder: text('placeholder').default('Type here'),
  placeholderGen: integer('placeholderGen', { mode: 'boolean' })
    .notNull()
    .default(true),
})

/**
 * Property value definitions
 * @remarks
 * Stores possible values for properties
 */
export const propertyValue = sqliteTable('propertyValue', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  propertyId: text('propertyId')
    .notNull()
    .references(() => property.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  // Priority in the rank order of the property values - lower numbers are shown first
  rank: integer('rank').notNull().default(0),
  // Canonical value for non-translatable classifier values.
  value: text('value'),
})

/**
 * Property value translations
 * @remarks
 * Stores multilingual content for property values
 */
export const propertyValueI18n = sqliteTable(
  'propertyValueI18n',
  {
    propertyValueId: text('propertyValueId')
      .notNull()
      .references(() => propertyValue.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    locale: text('locale', {
      enum: supportedLocales as [string, ...string[]],
    }).notNull(),
    // Value in {locale}
    value: text('value').notNull(),
    valueGen: integer('valueGen', { mode: 'boolean' }).notNull().default(false),
  },
  table => [primaryKey({ columns: [table.propertyValueId, table.locale] })],
)
