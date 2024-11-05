import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { AdapterAccountType } from '@auth/core/adapters';
import { relations, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { GeometryObject } from 'geojson';

// TYPES
import type {
  GhostSignsFeatureProperties,
  AddressProperties,
  LayerMetadata
} from '$lib/types';

// UTILS
const getGenImageParam = (): number => Math.floor(Math.random() * (100 - 5 + 1)) + 5;

/* ----------------- */
// USERS
/* -------- */

export const user = sqliteTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  name: text('name'),
  attribution: text('attribution'),
  email: text('email').unique(),
  emailVerified: integer('emailVerified', { mode: 'timestamp_ms' })
    .$onUpdateFn(() => new Date())
    .$type<Date>(),
  image: text('image'),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull()
});

export const userRelations = relations(user, ({ many }) => ({
  memberships: many(organisationRole),
  accounts: many(account),
  projectRoles: many(projectRole)
}));

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

/* ----------------- */
// ORGANISATIONS
/* -------- */

/* Organisations, have
 * - NONE, ONE, or MANY `GeoProjects` that they own.
 * - ONE or MANY `Owners`; associated users with the `OrganisationOwner` role
 * - ONE or MANY `Members`; associated users with the `OrganisationMember` role
 *
 * Ownership does not imply membership, they both need to be defined.
 *
 * Users, have
 * - NONE or ONE SuperAdmin role. Provides full rights in the app. Ben, Billy, Mart.
 * - NONE, ONE, or MANY `OrganisationOwner` roles. Provides organisational admin rights.
 * - NONE, ONE, or MANY `OrganisationMember` roles. Defines membership of `Organisation`(s).
 * - NONE, ONE, or MANY `GeoProjectMaintainer` roles. Provides project edit rights.
 *
 * GeoProjects, have
 * - ONE or MANY `Maintainers`; associated users with the `GeoProjectMaintainer` role.
 *
 * Only the Members of the Organisation which owns a GeoProject can be selected as its maintainer.
 *  */

export const organisation = sqliteTable('organisation', {
  // Database identifier
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  // Public identifier
  code: text('code').unique().notNull(),
  // Full Name in English
  name: text('name').notNull(),
  nameGen: integer('nameGen', { mode: 'boolean' }).notNull().default(false),
  // Short Name in English, used in navigation
  nameShort: text('nameShort').notNull(),
  nameShortGen: integer('nameShortGen', { mode: 'boolean' }).notNull().default(false),
  // Description in English
  description: text('description'),
  descriptionGen: integer('descriptionGen', { mode: 'boolean' }).notNull().default(false),
  url: text('url'),
  image: text('image').default(
    `https://generative-placeholders.glitch.me/image?width=720&height=720&style=triangles&gap=${getGenImageParam()}`
  ),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull()
});

export const organisationRelations = relations(organisation, ({ many }) => ({
  translations: many(organisationI18n),
  userRoles: many(organisationRole)
}));

export const organisationI18n = sqliteTable(
  'organisationI18n',
  {
    organisationId: text('organisationId')
      .notNull()
      .references(() => organisation.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // IETF BCP 47 language tag
    // https://www.rfc-editor.org/info/bcp47
    lang: text('lang', { enum: ['zh-hant', 'zh-hans'] }).notNull(),
    // Full Name in {lang}
    name: text('name').notNull(),
    nameGen: integer('nameGen', { mode: 'boolean' }).notNull().default(true),
    // Short Name  in {lang}, used in navigation
    nameShort: text('nameShort').notNull(),
    nameShortGen: integer('nameShortGen', { mode: 'boolean' }).notNull().default(true),
    // Description in {lang}
    description: text('description'),
    descriptionGen: integer('descriptionGen', { mode: 'boolean' }).notNull().default(true)
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organisationId, t.lang] })
  })
);

export const organisationI18nRelations = relations(organisationI18n, ({ one }) => ({
  organisation: one(organisation, {
    fields: [organisationI18n.organisationId],
    references: [organisation.id]
  })
}));

export const organisationRole = sqliteTable(
  'organisationRole',
  {
    organisationId: text('organisationId')
      .notNull()
      .references(() => organisation.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    role: text('role', { enum: ['member', 'owner'] })
      .notNull()
      .default('member')
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organisationId, t.userId] })
  })
);

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

/* ----------------- */
// AUTH
/* -------- */

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

/* ----------------- */
// PROJECTS
/* -------- */
export const project = sqliteTable('project', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  organisationId: text('organisationId')
    .notNull()
    .references(() => organisation.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  // Public identifier
  code: text('code').unique().notNull(),
  // Full Name in English
  name: text('name').notNull(),
  nameGen: integer('nameGen', { mode: 'boolean' }).notNull().default(false),
  // Short Name in English, used in navigation
  nameShort: text('nameShort').notNull(),
  nameShortGen: integer('nameShortGen', { mode: 'boolean' }).notNull().default(false),
  // Description in English
  description: text('description'),
  descriptionGen: integer('descriptionGen', { mode: 'boolean' }).notNull().default(false),
  // License under which the dataset is made public
  license: text('license').default('Copyright').notNull(),
  licenseGen: integer('licenseGen', { mode: 'boolean' }).notNull().default(false),
  // Attribution for the dataset
  attribution: text('attribution').notNull(),
  attributionGen: integer('attributionGen', { mode: 'boolean' }).notNull().default(false),
  // Project Banner
  image: text('image').default(
    `https://generative-placeholders.glitch.me/image?width=720&height=720&style=cellular-automata&cells=${getGenImageParam()}`
  ),
  // Accessible to the public in the app
  isPublished: integer('isPublished', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull()
});

export const projectRelations = relations(project, ({ one, many }) => ({
  organisation: one(organisation, {
    fields: [project.organisationId],
    references: [organisation.id]
  }),
  layers: many(layer),
  properties: many(property),
  translations: many(projectI18n),
  maintainerRoles: many(projectRole)
}));

export const projectI18n = sqliteTable(
  'projectI18n',
  {
    projectId: text('projectId')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // IETF BCP 47 language tag
    // https://www.rfc-editor.org/info/bcp47
    lang: text('lang', { enum: ['zh-hant', 'zh-hans'] }).notNull(),
    // Full Name in {lang}
    name: text('name').notNull(),
    nameGen: integer('nameGen', { mode: 'boolean' }).notNull().default(true),
    // Short Name  in {lang}, used in navigation
    nameShort: text('nameShort').notNull(),
    nameShortGen: integer('nameShortGen', { mode: 'boolean' }).notNull().default(true),
    // Description in {lang}
    description: text('description'),
    descriptionGen: integer('descriptionGen', { mode: 'boolean' }).notNull().default(true),
    // Licence in {lang}
    license: text('license'),
    licenseGen: integer('licenseGen', { mode: 'boolean' }).notNull().default(true),
    // Description in {lang}
    attribution: text('attribution'),
    attributionGen: integer('attributionGen', { mode: 'boolean' }).notNull().default(true)
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.lang] })
  })
);

export const projectI18nRelations = relations(projectI18n, ({ one }) => ({
  project: one(project, {
    fields: [projectI18n.projectId],
    references: [project.id]
  })
}));

export const projectRole = sqliteTable(
  'projectRole',
  {
    projectId: text('projectId')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    role: text('role', { enum: ['maintainer'] })
      .notNull()
      .default('maintainer')
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.userId] })
  })
);

// Define relations
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

/* ----------------- */
// LAYERS
/* -------- */

/* @geojson/GeometryCollection */
export const layer = sqliteTable('layer', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  projectId: text('projectId')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  // Full Name in English
  name: text('name').notNull(),
  nameGen: integer('nameGen', { mode: 'boolean' }).notNull().default(false),
  // Short Name in English, used in controls and legends
  nameShort: text('nameShort').notNull(),
  nameShortGen: integer('nameShortGen', { mode: 'boolean' }).notNull().default(false),
  // Description in English
  description: text('description'),
  descriptionGen: integer('descriptionGen', { mode: 'boolean' }).notNull().default(false),
  // Additional Information
  metadata: text('metadata', { mode: 'json' }).$type<LayerMetadata>(),
  // Accessible to the public in the app
  isPublished: integer('isPublished', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull()
});

export const layerRelations = relations(layer, ({ many }) => ({
  translations: many(layerI18n),
  properties: many(layerProperty),
  features: many(feature)
}));

export const layerI18n = sqliteTable(
  'layerI18n',
  {
    layerId: text('layerId')
      .notNull()
      .references(() => layer.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // IETF BCP 47 language tag
    // https://www.rfc-editor.org/info/bcp47
    lang: text('lang', { enum: ['zh-hant', 'zh-hans'] }).notNull(),
    // Full Name in {lang}
    name: text('name').notNull(),
    nameGen: integer('nameGen', { mode: 'boolean' }).notNull().default(true),
    // Short Name in {lang}, used in controls and legends
    nameShort: text('nameShort').notNull(),
    nameShortGen: integer('nameShortGen', { mode: 'boolean' }).notNull().default(true),
    // Description in {lang}
    description: text('description'),
    descriptionGen: integer('descriptionGen', { mode: 'boolean' }).notNull().default(true)
  },
  (t) => ({
    pk: primaryKey({ columns: [t.layerId, t.lang] })
  })
);

export const layerI18nRelations = relations(layerI18n, ({ one }) => ({
  layer: one(layer, {
    fields: [layerI18n.layerId],
    references: [layer.id]
  })
}));

/* ----------------- */
// FEATURES
/* -------- */

/* @geojson/Feature */
export const feature = sqliteTable('feature', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  geometry: text('geometry', { mode: 'json' }).notNull().$type<GeometryObject>(),
  properties: text('properties', { mode: 'json' }).notNull().$type<GhostSignsFeatureProperties>(),
  addressProperties: text('addressProperties', { mode: 'json' }).$type<AddressProperties>(),
  layerId: text('layerId')
    .notNull()
    .references(() => layer.id, { onDelete: 'cascade' }),
  contributorId: text('contributorId').references(() => user.id, { onDelete: 'set null' }),
  publisherId: text('publisherId').references(() => user.id, { onDelete: 'set null' }),
  isPublished: integer('isPublished', { mode: 'boolean' }).notNull().default(false),

  // PUBLISHED
  // Visitable + Tangible            : Listing - Feature has a physical presence and can be visited - the default
  // Visitable + NOT Tangible        : Intangible Listing - Feature lacks physical presence, BUT the site itself holds historic value
  // NOT Visitable + Tangible        : Unavailable - Feature is extant, but is (temporarily) not visitable due to obstruction / access rights
  // NOT Visitable + NOT Tangible    : Inaccessible - Feature has intangible value, BUT the site is (temporarily) not accessible.

  // NOT PUBLISHED
  // Visitable + Tangible           : Draft - Unpublished Tangible Listing
  // Visitable + NOT Tangible       : Draft - Unpublished Intangible Listing
  // NOT Visitable + Tangible       : Delisted - Feature destroyed / removed / otherwise erased, and should no longer be shown on public maps.
  // NOT Visitable + NOT Tangible   : Delisted - Feature no longer offers any significance to the collection and should not be shown on public maps.

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

export const featureRelations = relations(feature, ({ one }) => ({
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
  })
}));

// TODO Add visit table linking Users with GeoFeatures for a given date
// TODO When a new visit is created for a GeoFeature, update its "visitableAsOf" field to that date.
// TODO Add a checkinType of values "visit" and "reportMissing"
// TODO Add a isHandled to indicate that follow up action was taken (e.g. report missing was dealt with)

/* ----------------- */
// PROPERTIES
/* -------- */

export const property = sqliteTable('property', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  projectId: text('projectId')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  type: text('type', { enum: ['classifier', 'specifier', 'display'] })
    .notNull()
    .default('classifier'),
  key: text('key').notNull(),
  label: text('label').notNull(),
  labelGen: integer('labelGen', { mode: 'boolean' }).notNull().default(true),
  placeholder: text('placeholder').default('Type here'),
  placeholderGen: integer('placeholderGen', { mode: 'boolean' }).notNull().default(true),
  component: text('component', {
    enum: ['SelectField', 'RangeField', 'InputField', 'TextareaField', 'TagsField']
  })
    .notNull()
    .default('SelectField'),
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

export const propertyRelations = relations(property, ({ one, many }) => ({
  project: one(project, {
    fields: [property.projectId],
    references: [project.id]
  }),
  values: many(propertyValue),
  translations: many(propertyI18n)
}));

export const propertyI18n = sqliteTable('propertyI18n', {
  propertyId: text('propertyId')
    .notNull()
    .references(() => property.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  lang: text('lang', { enum: ['zh-hant', 'zh-hans'] }).notNull(),
  label: text('label').notNull(),
  labelGen: integer('labelGen', { mode: 'boolean' }).notNull().default(true),
  placeholder: text('placeholder').default('Type here'),
  placeholderGen: integer('placeholderGen', { mode: 'boolean' }).notNull().default(true)
});

export const propertyI18nRelations = relations(propertyI18n, ({ one }) => ({
  property: one(property, {
    fields: [propertyI18n.propertyId],
    references: [property.id]
  })
}));

export const propertyValue = sqliteTable('propertyValue', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  propertyId: text('propertyId')
    .notNull()
    .references(() => property.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  value: text('value').notNull(),
  valueGen: integer('valueGen', { mode: 'boolean' }).notNull().default(true),
  // Priority in the rank order of the property values - lower numbers are shown first
  rank: integer('rank').notNull().default(0)
});

export const propertyValueRelations = relations(propertyValue, ({ one, many }) => ({
  property: one(property, {
    fields: [propertyValue.propertyId],
    references: [property.id]
  }),
  translations: many(propertyValueI18n)
}));

export const propertyValueI18n = sqliteTable('propertyValueI18n', {
  propertyValueId: text('propertyValueId')
    .notNull()
    .references(() => propertyValue.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  lang: text('lang', { enum: ['zh-hant', 'zh-hans'] }).notNull(),
  value: text('value').notNull(),
  valueGen: integer('valueGen', { mode: 'boolean' }).notNull().default(true)
  },
  (t) => ({
    pk: primaryKey({ columns: [t.propertyValueId, t.lang] })
  })
);

export const propertyValueI18nRelations = relations(propertyValueI18n, ({ one }) => ({
  propertyValue: one(propertyValue, {
    fields: [propertyValueI18n.propertyValueId],
    references: [propertyValue.id]
  })
}));

export const layerProperty = sqliteTable('layerProperty', {
  layerId: text('layerId')
    .notNull()
    .references(() => layer.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  propertyId: text('propertyId')
    .notNull()
    .references(() => property.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  isVisible: integer('isVisible', { mode: 'boolean' }).notNull().default(true)
});

export const layerPropertyRelations = relations(layerProperty, ({ one }) => ({  
  layer: one(layer, {
    fields: [layerProperty.layerId],
    references: [layer.id]
  }),
  property: one(property, {
    fields: [layerProperty.propertyId],
    references: [property.id]
  })
}));