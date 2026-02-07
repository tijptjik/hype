import {
  foreignKey,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
// SCHEMA
import { organisation } from './organisation'
import { project } from './project'
import { layer } from './layer'
import { user } from './user'
import { property } from './property'
import { propertyValue } from './property'
// ENUM
import { supportedLocales } from '../../enums'
// TYPES
import type { GeometryObject } from 'geojson'
import type { AddressProperties, AddressMeta } from '../../types'

/* ============================================================================
 * FEATURE MANAGEMENT
 * ============================================================================
 * Tables for managing map features, their properties, and images
 */

/**
 * Core feature table
 * @remarks
 * Stores feature information and metadata
 * - Geometry and location data
 * - Publication status
 * - Layer and contributor references
 * - Visitability status
 *
 * Feature States:
 *
 * PUBLISHED:
 * - Visitable + Tangible: Listing (default)
 * - Visitable + NOT Tangible: Intangible Listing
 * - NOT Visitable + Tangible: Unavailable
 * - NOT Visitable + NOT Tangible: Inaccessible
 *
 * NOT PUBLISHED:
 * - Visitable + Tangible: Draft
 * - Visitable + NOT Tangible: Draft Intangible
 * - NOT Visitable + Tangible: Delisted
 * - NOT Visitable + NOT Tangible: Delisted
 */
export const feature = sqliteTable('feature', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  organisationId: text('organisationId')
    .notNull()
    .references(() => organisation.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  projectId: text('projectId')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  layerId: text('layerId')
    .notNull()
    .references(() => layer.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  contributorId: text('contributorId').references(() => user.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
  }),

  geometry: text('geometry', { mode: 'json' }).notNull().$type<GeometryObject>(),
  // Address Metadata
  addressMeta: text('addressMeta', {
    mode: 'json',
  })
    .$type<AddressMeta>()
    .default({}),
  // True : Feature is shown in the User App
  // False : Feature is only shown in the Admin Panel
  isPublished: integer('isPublished', { mode: 'boolean' }).notNull().default(false),
  publisherId: text('publisherId').references(() => user.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
  }),
  publishedAt: text('publishedAt'),
  // False : Feature shows up everywhere in the Admin Panel
  // True : Feature only shows up in the Review Queue
  isPendingReview: integer('isPendingReview', { mode: 'boolean' })
    .notNull()
    .default(false),
  // False : Feature may be shown in the Admin Panel
  // True : Feature is considered deleted
  isArchived: integer('isArchived', { mode: 'boolean' }).notNull().default(false),
  isIntangible: integer('isIntangible', { mode: 'boolean' }).notNull().default(false),
  isVisitable: integer('isVisitable', { mode: 'boolean' }).notNull().default(true),
  visitableAsOf: text('visitableAsOf').default(sql`(CURRENT_DATE)`),

  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull(),
})

/**
 * Feature translations
 * @remarks
 * Stores multilingual content for features
 */
export const featureI18n = sqliteTable(
  'featureI18n',
  {
    featureId: text('featureId')
      .notNull()
      .references(() => feature.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    locale: text('locale', {
      enum: supportedLocales as [string, ...string[]],
    }).notNull(),
    // Full Name in {locale}
    title: text('title').notNull(),
    titleGen: integer('titleGen', { mode: 'boolean' }).notNull().default(true),
    // Description in {locale}
    description: text('description'),
    descriptionGen: integer('descriptionGen', { mode: 'boolean' })
      .notNull()
      .default(true),
    // Display Address in {locale}
    displayAddress: text('displayAddress'),
    displayAddressGen: integer('displayAddressGen', { mode: 'boolean' })
      .notNull()
      .default(true),
    // Address Properties in {locale}
    addressProperties: text('addressProperties', {
      mode: 'json',
    }).$type<AddressProperties>(),
  },
  table => [primaryKey({ columns: [table.featureId, table.locale] })],
)

/**
 * Feature property assignments
 * @remarks
 * Links features to their properties and values
 */
export const featureProperty = sqliteTable(
  'featureProperty',
  {
    featureId: text('featureId')
      .notNull()
      .references(() => feature.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    propertyId: text('propertyId')
      .notNull()
      .references(() => property.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    propertyValueId: text('propertyValueId').references(() => propertyValue.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    // If the property value is non-categorical AND it does not translate, e.g. a number, a date, a boolean, etc.
    // The value is set directly on the featureProperty table. In this case, the propertyValueId is null, and there
    // are no i18n records for this property. The inverse is also true, i.e. if the property value is non-categorical,
    // but it does translate, this value is null, and there are i18n records for this property. Finally, if the property value is
    // categorical, there will be no value set, and there will be no i18n records for this property. Instead the i18n records will be
    // set on the propertyValue table.
    value: text('value'),
  },
  table => [primaryKey({ columns: [table.featureId, table.propertyId] })],
)

/**
 * Feature property translations
 * @remarks
 * Stores multilingual content for feature properties
 */
export const featurePropertyI18n = sqliteTable(
  'featurePropertyI18n',
  {
    featureId: text('featureId')
      .notNull()
      .references(() => feature.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    propertyId: text('propertyId')
      .notNull()
      .references(() => property.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    locale: text('locale', {
      enum: supportedLocales as [string, ...string[]],
    }).notNull(),
    // Value in {locale}
    value: text('value'),
    valueGen: integer('valueGen', { mode: 'boolean' }),
  },
  table => [
    primaryKey({ columns: [table.featureId, table.propertyId, table.locale] }),
    foreignKey({
      columns: [table.featureId, table.propertyId],
      foreignColumns: [featureProperty.featureId, featureProperty.propertyId],
      name: 'featurePropertyI18n_featureProperty_fk',
    }),
  ],
)
