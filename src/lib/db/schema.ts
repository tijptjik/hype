import {
  foreignKey,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex
} from 'drizzle-orm/sqlite-core';
import type { AdapterAccountType } from '@auth/core/adapters';
import { relations, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
// ENUM
import {
  ImageCDN,
  SupportedLocales,
  supportedLocales,
  FieldDiscriminator,
  PropertyComponentType,
  OrganisationRoleType,
  ProjectRoleType,
  ImageEnv,
  TaskType,
  TaskReviewOutcome,
  TaskReviewAction,
  ImageIntent
} from '../enums';
// TYPES
import type { GeometryObject } from 'geojson';
import type { AddressProperties, AddressMeta, LayerMetadata, Locale, EXIF, UserExperimental, UserPreferences } from '../types';

/* ============================================================================
 * USER MANAGEMENT
 * ============================================================================
 * Tables related to user accounts, authentication, and user preferences
 */

/**
 * Core user table storing user account information and preferences. Created by Auth.
 * @remarks
 * - Stores basic user information (name, email, etc.)
 * - Contains user preferences for language and experimental features
 * - Links to user activity and roles in organizations/projects
 */
export const user = sqliteTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: integer('emailVerified', { mode: 'timestamp_ms' })
    .$onUpdateFn(() => new Date())
    .$type<Date>(),
  image: text('image'),
  locale: text('locale', { enum: supportedLocales }).notNull().default(SupportedLocales.en),
  attribution: text('attribution'),
  // If a user is archived, their account is effectively disabled, and they are not allowed to login
  isArchived: integer('isArchived', { mode: 'boolean' }).notNull().default(false),
  // Language features
  preferences: text('preferences', { mode: 'json' })
    .$type<UserPreferences>()
    .default(
      sql`'{"fallbackLocales":[], "allowMachineTranslation":false, "preferFallbackInCurrentLocale":false, "isTranslateButtonVisible":true}'`
    )
    .notNull(),
  // Experimental features
  experimental: text('experimental', { mode: 'json' })
    .$type<UserExperimental>()
    .default(
      sql`'{"contributorMode":false, "noLabelsMode":false}'`
    )
    .notNull(),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull()
});

/**
 * User relations
 * @remarks
 * Links user to their memberships, roles, contributions, and preferences
 */
export const userRelations = relations(user, ({ many }) => ({
  memberships: many(organisationRole),
  projectRoles: many(projectRole),
  contributedImages: many(image, { relationName: 'contributor' }),
  contributedTasks: many(task, { relationName: 'contributorTasks' }),
  reviewedTasks: many(task, { relationName: 'reviewerTasks' }),
  userFeatures: many(userFeature),
  userLayers: many(userLayer)
}));

/**
 * User activity tracking
 * @remarks
 * Tracks user activity metrics such as login count and last login timestamp
 */
export const userActivity = sqliteTable('userActivity', {
  userId: text('userId')
    .primaryKey()
    .references(() => user.id, { onUpdate: 'cascade', onDelete: 'cascade' }),
  loginCount: integer('loginCount')
    .default(sql`0`)
    .$onUpdateFn(() => sql`login_count + 1`),
  lastLogin: text('lastLogin')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
});


/* ============================================================================
 * AUTHENTICATION
 * ============================================================================
 * Tables for managing user authentication and sessions
 */

/**
 * External authentication provider accounts. Provided by the auth.js library.
 * @remarks
 * Links external authentication providers to user accounts
 */
export const account = sqliteTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state')
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId]
    })
  })
);

/**
 * User sessions
 * @remarks
 * Manages active user sessions and their expiration
 */
export const session = sqliteTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  expires: integer('expires', { mode: 'timestamp_ms' })
    .notNull()
    .$onUpdateFn(() => new Date())
    .$type<Date>()
});

/* ============================================================================
 * ORGANIZATION MANAGEMENT
 * ============================================================================
 * Tables for managing organizations, their members, and roles
 * 
 * Organizations have:
 * - NONE, ONE, or MANY GeoProjects that they own
 * - ONE or MANY Owners (users with OrganisationOwner role)
 * - ONE or MANY Members (users with OrganisationMember role)
 * 
 * Users have:
 * - NONE or ONE SuperAdmin role (full app rights)
 * - NONE, ONE, or MANY OrganisationOwner roles (org admin rights)
 * - NONE, ONE, or MANY OrganisationMember roles (org membership)
 * - NONE, ONE, or MANY GeoProjectMaintainer roles (project edit rights)
 * 
 * GeoProjects have:
 * - ONE or MANY Maintainers (users with GeoProjectMaintainer role)
 * 
 * Note: Only Members of the Organization which owns a GeoProject can be selected as its maintainer
 */

/**
 * Core organisation table
 * @remarks
 * Stores organisation information and metadata
 * - Basic info (code, URL, image)
 * - Publication status
 * - Publisher reference
 * - Archive status
 */
export const organisation = sqliteTable('organisation', {
  // Database identifier
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  // Public identifier
  code: text('code').unique().notNull(),
  url: text('url'),
  imageId: text('imageId').references(() => image.id, {
    onDelete: 'set null',
    onUpdate: 'cascade'
  }),
  isPublished: integer('isPublished', { mode: 'boolean' }).notNull().default(true),
  publishedAt: text('publishedAt'),
  publisherId: text('publisherId').references(() => user.id, {
    onDelete: 'set null',
    onUpdate: 'cascade'
  }),
  // False : Organisation may be shown in the Admin Panel
  // True : Organisation is considered deleted
  isArchived: integer('isArchived', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull()
});

/**
 * Organization relations
 * @remarks
 * Links organization to its translations, members, projects, and metadata
 */
export const organisationRelations = relations(organisation, ({ one, many }) => ({
  i18n: many(organisationI18n),
  userRoles: many(organisationRole),
  image: one(image, {
    fields: [organisation.imageId],
    references: [image.id]
  }),
  publisher: one(user, {
    fields: [organisation.publisherId],
    references: [user.id]
  }),
  projects: many(project),
  tasks: many(task)
}));

/**
 * Organization translations
 * @remarks
 * Stores multilingual content for organizations
 */
export const organisationI18n = sqliteTable(
  'organisationI18n',
  {
    organisationId: text('organisationId')
      .notNull()
      .references(() => organisation.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // IETF BCP 47 language tag
    // https://www.rfc-editor.org/info/bcp47
    locale: text('locale', { enum: supportedLocales }).notNull(),
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
      .default(true)
  },
  (table) => [
    primaryKey({ columns: [table.organisationId, table.locale] })
  ]
);

/**
 * Organization translation relations
 */
export const organisationI18nRelations = relations(organisationI18n, ({ one }) => ({
  organisation: one(organisation, {
    fields: [organisationI18n.organisationId],
    references: [organisation.id]
  })
}));

/**
 * Organization role assignments
 * @remarks
 * Links users to organizations with specific roles (member/owner)
 */
export const organisationRole = sqliteTable(
  'organisationRole',
  {
    organisationId: text('organisationId')
      .notNull()
      .references(() => organisation.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    role: text('role', { enum: Object.values(OrganisationRoleType) as [string, ...string[]] })
      .notNull()
      .default(OrganisationRoleType.member)
  },
  (table) => [
    primaryKey({ columns: [table.organisationId, table.userId] })
  ]
);

/**
 * Organization role relations
 */
export const organisationRoleRelations = relations(organisationRole, ({ one }) => ({
  user: one(user, {
    fields: [organisationRole.userId],
    references: [user.id]
  }),
  organisation: one(organisation, {
    fields: [organisationRole.organisationId],
    references: [organisation.id]
  })
}));


/* ============================================================================
 * PROJECT MANAGEMENT
 * ============================================================================
 * Tables for managing projects, their properties, and maintainers
 */

/**
 * Core project table
 * @remarks
 * Stores project information and metadata
 * - Basic info (code, image)
 * - Organization reference
 * - Publication status
 * - Archive status
 */
export const project = sqliteTable('project', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  organisationId: text('organisationId')
    .notNull()
    .references(() => organisation.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  // Public identifier
  code: text('code').unique().notNull(),
  imageId: text('imageId').references(() => image.id, {
    onDelete: 'set null',
    onUpdate: 'cascade'
  }),
  // Accessible to the public in the app
  isPublished: integer('isPublished', { mode: 'boolean' }).notNull().default(false),
  publishedAt: text('publishedAt'),
  publisherId: text('publisherId').references(() => user.id, {
    onDelete: 'set null',
    onUpdate: 'cascade'
  }),
  // False : Project may be shown in the Admin Panel
  // True : Project is considered deleted
  isArchived: integer('isArchived', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull()
});

/**
 * Project relations
 * @remarks
 * Links project to its translations, maintainers, properties, and metadata
 */
export const projectRelations = relations(project, ({ one, many }) => ({
  organisation: one(organisation, {
    fields: [project.organisationId],
    references: [organisation.id]
  }),
  i18n: many(projectI18n),
  maintainerRoles: many(projectRole),
  properties: many(property),
  layers: many(layer),
  tasks: many(task),
  image: one(image, {
    fields: [project.imageId],
    references: [image.id]
  }),
  publisher: one(user, {
    fields: [project.publisherId],
    references: [user.id]
  })
}));

/**
 * Project translations
 * @remarks
 * Stores multilingual content for projects
 */
export const projectI18n = sqliteTable(
  'projectI18n',
  {
    projectId: text('projectId')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    locale: text('locale', { enum: supportedLocales }).notNull(),
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
    // License in {locale}
    license: text('license').default('Copyright').notNull(),
    licenseGen: integer('licenseGen', { mode: 'boolean' }).notNull().default(true),
    // Attribution in {locale}
    attribution: text('attribution').notNull(),
    attributionGen: integer('attributionGen', { mode: 'boolean' })
      .notNull()
      .default(true)
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.locale] })
  ]
);

/**
 * Project translation relations
 */
export const projectI18nRelations = relations(projectI18n, ({ one }) => ({
  project: one(project, {
    fields: [projectI18n.projectId],
    references: [project.id]
  })
}));

/**
 * Project role assignments
 * @remarks
 * Links users to projects with maintainer roles
 */
export const projectRole = sqliteTable(
  'projectRole',
  {
    projectId: text('projectId')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    role: text('role', { enum: Object.values(ProjectRoleType) as [string, ...string[]] })
      .notNull()
      .default(ProjectRoleType.maintainer)
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] })
  ]
);

/**
 * Project role relations
 */
export const projectRoleRelations = relations(projectRole, ({ one }) => ({
  project: one(project, {
    fields: [projectRole.projectId],
    references: [project.id]
  }),
  user: one(user, {
    fields: [projectRole.userId],
    references: [user.id]
  })
}));

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
  publishedAt: text('publishedAt'),
  publisherId: text('publisherId').references(() => user.id, {
    onDelete: 'set null',
    onUpdate: 'cascade'
  }),
  // False : Layer may be shown in the Admin Panel
  // True : Layer is considered deleted
  isArchived: integer('isArchived', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull()
});

/**
 * Layer relations
 * @remarks
 * Links layer to its translations, properties, features, and project
 */
export const layerRelations = relations(layer, ({ many, one }) => ({
  i18n: many(layerI18n),
  properties: many(layerProperty),
  features: many(feature),
  publisher: one(user, {
    fields: [layer.publisherId],
    references: [user.id]
  }),
  project: one(project, {
    fields: [layer.projectId],
    references: [project.id]
  })
}));

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
    locale: text('locale', { enum: supportedLocales }).notNull(),
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
      .default(true)
  },
  (table) => [
    primaryKey({ columns: [table.layerId, table.locale] })
  ]
);

/**
 * Layer translation relations
 */
export const layerI18nRelations = relations(layerI18n, ({ one }) => ({
  layer: one(layer, {
    fields: [layerI18n.layerId],
    references: [layer.id]
  })
}));

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
  geometry: text('geometry', { mode: 'json' }).notNull().$type<GeometryObject>(),
  // Address Metadata
  addressMeta: text('addressMeta', {
    mode: 'json'
  })
    .$type<AddressMeta>()
    .default({}),
  layerId: text('layerId')
    .notNull()
    .references(() => layer.id, { onDelete: 'cascade' }),
  contributorId: text('contributorId').references(() => user.id, {
    onDelete: 'set null'
  }),
  // True : Feature is shown in the User App
  // False : Feature is only shown in the Admin Panel
  isPublished: integer('isPublished', { mode: 'boolean' }).notNull().default(false),
  publisherId: text('publisherId').references(() => user.id, { onDelete: 'set null' }),
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
    .notNull()
});

/**
 * Feature relations
 * @remarks
 * Links feature to its translations, properties, images, and metadata
 */
export const featureRelations = relations(feature, ({ one, many }) => ({
  layer: one(layer, {
    fields: [feature.layerId],
    references: [layer.id]
  }),
  contributor: one(user, {
    fields: [feature.contributorId],
    references: [user.id]
  }),
  publisher: one(user, {
    fields: [feature.publisherId],
    references: [user.id]
  }),
  i18n: many(featureI18n),
  properties: many(featureProperty),
  images: many(featureImage),
  users: many(userFeature),
  tasks: many(task)
}));

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
    locale: text('locale', { enum: supportedLocales }).notNull(),
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
      mode: 'json'
    }).$type<AddressProperties>()
  },
  (table) => [
    primaryKey({ columns: [table.featureId, table.locale] })
  ]
);

/**
 * Feature translation relations
 */
export const featureI18nRelations = relations(featureI18n, ({ one }) => ({
  feature: one(feature, {
    fields: [featureI18n.featureId],
    references: [feature.id]
  })
}));

/**
 * Feature property assignments
 * @remarks
 * Links features to their properties and values
 */
export const featureProperty = sqliteTable('featureProperty', {
  featureId: text('featureId')
    .notNull()
    .references(() => feature.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  propertyId: text('propertyId')
    .notNull()
    .references(() => property.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  propertyValueId: text('propertyValueId').references(() => propertyValue.id, {
    onDelete: 'set null',
    onUpdate: 'cascade'
  }),
  // If the property value is non-categorical AND it does not translate, e.g. a number, a date, a boolean, etc.
  // The value is set directly on the featureProperty table. In this case, the propertyValueId is null, and there 
  // are no i18n records for this property. The inverse is also true, i.e. if the property value is non-categorical, 
  // but it does translate, this value is null, and there are i18n records for this property. Finally, if the property value is 
  // categorical, there will be no value set, and there will be no i18n records for this property. Instead the i18n records will be 
  // set on the propertyValue table.
  value: text('value')
}, (table) => [
  primaryKey({ columns: [table.featureId, table.propertyId] })
]);

/**
 * Feature property relations
 * @remarks
 * Links feature properties to their translations and values
 */
export const featurePropertyRelations = relations(featureProperty, ({ one, many }) => ({
  feature: one(feature, {
    fields: [featureProperty.featureId],
    references: [feature.id]
  }),
  property: one(property, {
    fields: [featureProperty.propertyId],
    references: [property.id]
  }),
  propertyValue: one(propertyValue, {
    fields: [featureProperty.propertyValueId],
    references: [propertyValue.id]
  }),
  i18n: many(featurePropertyI18n)
}));

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
        onUpdate: 'cascade'
      }),
    propertyId: text('propertyId')
      .notNull()
      .references(() => property.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade'
      }),
    locale: text('locale', { enum: supportedLocales }).notNull(),
    // Value in {locale}
    value: text('value'),
    valueGen: integer('valueGen', { mode: 'boolean' })
  },
  (table) => [
    primaryKey({ columns: [table.featureId, table.propertyId, table.locale] }),
    foreignKey({
      columns: [table.featureId, table.propertyId],
      foreignColumns: [featureProperty.featureId, featureProperty.propertyId],
      name: 'featurePropertyI18n_featureProperty_fk'
    })
  ]
);

/**
 * Feature property translation relations
 */
export const featurePropertyI18nRelations = relations(
  featurePropertyI18n,
  ({ one }) => ({
    featureProperty: one(featureProperty, {
      fields: [featurePropertyI18n.featureId, featurePropertyI18n.propertyId],
      references: [featureProperty.featureId, featureProperty.propertyId]
    })
  })
);

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
  projectId: text('projectId')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  type: text('type', { enum: Object.values(FieldDiscriminator) as [string, ...string[]] })
    .notNull()
    .default(FieldDiscriminator.classifier),
  isTranslatable: integer('isTranslatable', { mode: 'boolean' }).notNull().default(true),
  key: text('key').notNull(),
  rank: integer('rank').notNull().default(0),
  component: text('component', {
    enum: Object.values(PropertyComponentType) as [string, ...string[]]
  })
    .notNull()
    .default(PropertyComponentType.SelectField),
  min: integer('min'),
  max: integer('max'),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull()
});

/**
 * Property relations
 * @remarks
 * Links property to its translations, values, and layer assignments
 */
export const propertyRelations = relations(property, ({ one, many }) => ({
  project: one(project, {
    fields: [property.projectId],
    references: [project.id]
  }),
  values: many(propertyValue),
  i18n: many(propertyI18n),
  layerProperties: many(layerProperty)
}));

/**
 * Property translations
 * @remarks
 * Stores multilingual content for properties
 */
export const propertyI18n = sqliteTable('propertyI18n', {
  propertyId: text('propertyId')
    .notNull()
    .references(() => property.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  locale: text('locale', { enum: supportedLocales }).notNull(),
  // Label in {locale}
  label: text('label').notNull(),
  labelGen: integer('labelGen', { mode: 'boolean' }).notNull().default(true),
  // Placeholder in {locale}
  placeholder: text('placeholder').default('Type here'),
  placeholderGen: integer('placeholderGen', { mode: 'boolean' }).notNull().default(true)
});

/**
 * Property translation relations
 */
export const propertyI18nRelations = relations(propertyI18n, ({ one }) => ({
  property: one(property, {
    fields: [propertyI18n.propertyId],
    references: [property.id]
  })
}));

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
  rank: integer('rank').notNull().default(0)
});

/**
 * Property value relations
 * @remarks
 * Links property values to their translations
 */
export const propertyValueRelations = relations(propertyValue, ({ one, many }) => ({
  property: one(property, {
    fields: [propertyValue.propertyId],
    references: [property.id]
  }),
  i18n: many(propertyValueI18n)
}));

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
    locale: text('locale', { enum: supportedLocales }).notNull(),
    // Value in {locale}
    value: text('value').notNull(),
    valueGen: integer('valueGen', { mode: 'boolean' }).notNull().default(false)
  },
  (table) => [
    primaryKey({ columns: [table.propertyValueId, table.locale] })
  ]
);

/**
 * Property value translation relations
 */
export const propertyValueI18nRelations = relations(propertyValueI18n, ({ one }) => ({
  propertyValue: one(propertyValue, {
    fields: [propertyValueI18n.propertyValueId],
    references: [propertyValue.id]
  })
}));

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
  isVisible: integer('isVisible', { mode: 'boolean' }).notNull().default(true)
});

/**
 * Layer property relations
 */
export const layerPropertyRelations = relations(layerProperty, ({ one, many }) => ({
  layer: one(layer, {
    fields: [layerProperty.layerId],
    references: [layer.id]
  }),
  property: one(property, {
    fields: [layerProperty.propertyId],
    references: [property.id]
  })
}));


/* ============================================================================
 * IMAGE MANAGEMENT
 * ============================================================================
 * Tables for managing images and their metadata
 */

/**
 * Core image table
 * @remarks
 * Stores image information and metadata
 * - CDN and file information
 * - EXIF metadata
 * - Contributor reference
 * - Archive status
 */
export const image = sqliteTable('image', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  contributorId: text('contributorId').references(() => user.id, {
    onDelete: 'set null',
    onUpdate: 'cascade'
  }),
  // CDN
  cdn: text('cdn', { enum: Object.values(ImageCDN) as [string, ...string[]] })
    .default(ImageCDN.cloudinary)
    .notNull(),
  // Cloudinary Cloud Name
  env: text('env', { enum: Object.values(ImageEnv) as [string, ...string[]] })
    .default(ImageEnv.dg6vtsga1)
    .notNull(),
  // Cloudinary Asset ID
  cdnId: text('cdnId'),
  // Cloudinary Public ID
  publicId: text('publicId').notNull(),
  // Cloudinary Version
  version: integer('version'),

  originalFilename: text('originalFilename'),
  originalExtension: text('originalExtension'),
  originalWidth: integer('originalWidth'),
  originalHeight: integer('originalHeight'),

  // EXIF Metadata
  metadata: text('metadata', { mode: 'json' }).$type<EXIF>(),
  cameraModel: text('cameraModel'),
  capturedAt: text('capturedAt'),
  latitude: text('latitude'),
  longitude: text('longitude'),
  credit: text('credit'),

  // False : Images may be shown in the Admin Panel
  // True : Image is considered deleted
  isArchived: integer('isArchived', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull()
});

/**
 * Image relations
 * @remarks
 * Links image to its contributor and feature/task assignments
 */
export const imageRelations = relations(image, ({ one, many }) => ({
  contributor: one(user, {
    relationName: 'contributor',
    fields: [image.contributorId],
    references: [user.id]
  }),
  featureImage: one(featureImage, {
    fields: [image.id],
    references: [featureImage.imageId]
  }),
  taskImages: many(taskImage)
}));

/**
 * Feature image assignments
 * @remarks
 * Links images to features with intent and publication status
 */
export const featureImage = sqliteTable(
  'featureImage',
  {
    featureId: text('featureId')
      .notNull()
      .references(() => feature.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    imageId: text('imageId')
      .notNull()
      .references(() => image.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    intent: text('intent', {
      enum: Object.values(ImageIntent) as [string, ...string[]]
    })
      .default(ImageIntent.undefined)
      .notNull(),
    isPublished: integer('isPublished', { mode: 'boolean' }).default(false).notNull(),
    publishedAt: text('publishedAt')
  },
  (table) => [
    primaryKey({ columns: [table.featureId, table.imageId] }),
    uniqueIndex('canonical_intent')
      .on(table.featureId)
      .where(sql`intent = 'canonical'`)
  ]
);

/**
 * Feature image relations
 */
export const featureImageRelations = relations(featureImage, ({ one }) => ({
  feature: one(feature, {
    fields: [featureImage.featureId],
    references: [feature.id]
  }),
  image: one(image, {
    fields: [featureImage.imageId],
    references: [image.id]
  })
}));

/* ============================================================================
 * USER INTERACTION
 * ============================================================================
 * Tables for managing user interactions with features and layers
 */

/**
 * User feature interactions
 * @remarks
 * Tracks user interactions with features (visits, wishlist)
 */
export const userFeature = sqliteTable(
  'userFeature',
  {
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    featureId: text('featureId')
      .notNull()
      .references(() => feature.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    isVisited: integer('isVisited', { mode: 'boolean' }).default(false).notNull(),
    isWishlisted: integer('isWishlisted', { mode: 'boolean' }).default(false).notNull(),
    visitedAt: text('visitedAt'),
    createdAt: text('createdAt')
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
      .notNull(),
    modifiedAt: text('modifiedAt')
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
      .$onUpdate(() => new Date().toISOString())
      .notNull()
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.featureId] })
  ]
);

/**
 * User feature relations
 */
export const userFeatureRelations = relations(userFeature, ({ one }) => ({
  user: one(user, {
    fields: [userFeature.userId],
    references: [user.id]
  }),
  feature: one(feature, {
    fields: [userFeature.featureId],
    references: [feature.id]
  })
}));

/**
 * User layer preferences
 * @remarks
 * Stores user preferences for layer visibility
 */
export const userLayer = sqliteTable(
  'userLayer',
  {
    layerId: text('layerId')
      .notNull()
      .references(() => layer.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    isVisibleOnLoad: integer('isVisibleOnLoad', { mode: 'boolean' })
      .notNull()
      .default(false)
  },
  (table) => [
    primaryKey({ columns: [table.layerId, table.userId] })
  ]
);

/**
 * User layer relations
 */
export const userLayerRelations = relations(userLayer, ({ one }) => ({
  user: one(user, {
    fields: [userLayer.userId],
    references: [user.id]
  }),
  layer: one(layer, {
    fields: [userLayer.layerId],
    references: [layer.id]
  })
}));

/* ============================================================================
 * TASK MANAGEMENT
 * ============================================================================
 * Tables for managing tasks and their associated images
 */

/**
 * Core task table
 * @remarks
 * Stores task information and metadata
 * - Task type (reportedMissing, newPhoto, newFeature)
 * - Organization, project, and feature references
 * - Contributor and reviewer references
 * - Review status and outcome
 */
export const task = sqliteTable('task', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  organisationId: text('organisationId')
    .notNull()
    .references(() => organisation.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  projectId: text('projectId')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  featureId: text('featureId')
    .notNull()
    .references(() => feature.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  contributorId: text('contributorId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  reviewerId: text('reviewerId').references(() => user.id, { onDelete: 'set null' }),
  type: text('type', { enum: Object.values(TaskType) as [string, ...string[]] }).notNull(),
  message: text('message'),
  isReviewed: integer('isReviewed', { mode: 'boolean' }).default(false).notNull(),
  reviewOutcome: text('reviewOutcome', { enum: Object.values(TaskReviewOutcome) as [string, ...string[]] }),
  reviewAction: text('reviewAction', {
    enum: Object.values(TaskReviewAction) as [string, ...string[]]
  }),
  reviewReason: text('reviewReason'),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull()
});

/**
 * Task relations
 * @remarks
 * Links task to its organization, project, feature, and images
 */
export const taskRelations = relations(task, ({ one, many }) => ({
  organisation: one(organisation, {
    fields: [task.organisationId],
    references: [organisation.id]
  }),
  project: one(project, {
    fields: [task.projectId],
    references: [project.id]
  }),
  feature: one(feature, {
    fields: [task.featureId],
    references: [feature.id]
  }),
  contributor: one(user, {
    relationName: 'contributorTasks',
    fields: [task.contributorId],
    references: [user.id]
  }),
  reviewer: one(user, {
    relationName: 'reviewerTasks',
    fields: [task.reviewerId],
    references: [user.id]
  }),
  images: many(taskImage)
}));

/**
 * Task image assignments
 * @remarks
 * Links images to tasks
 */
export const taskImage = sqliteTable(
  'taskImage',
  {
    taskId: text('taskId')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    imageId: text('imageId')
      .notNull()
      .references(() => image.id, { onDelete: 'cascade', onUpdate: 'cascade' })
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.imageId] })
  ]
);

/**
 * Task image relations
 */
export const taskImageRelations = relations(taskImage, ({ one }) => ({
  task: one(task, {
    fields: [taskImage.taskId],
    references: [task.id]
  }),
  image: one(image, {
    fields: [taskImage.imageId],
    references: [image.id]
  })
}));
