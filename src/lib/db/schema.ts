// noinspection JSUnusedGlobalSymbols
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { AdapterAccountType } from '@auth/core/adapters';
import { relations, sql } from 'drizzle-orm';
import type { GeometryObject } from 'geojson';
import shortUUID from 'short-uuid';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

/* ----------------- */
// USERS
/* -------- */

export const user = sqliteTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => shortUUID.generate()),
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

export const UserBase = createSelectSchema(user);

// Infer the type of OrganisationSchema
export type User = z.infer<typeof UserBase>;


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
    .$defaultFn(() => crypto.randomUUID()),
  // Public identifier
  code: text('code').unique().notNull(),
  // Full Name in English
  name: text('name').notNull(),
  // Short Name in English, used in navigation
  nameShort: text('nameShort').notNull(),
  // Description in English
  description: text('description'),
  url: text('url'),
  image: text('image'),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull()
});

export const organisationRelations = relations(organisation, ({ many }) => ({
  userRoles: many(organisationRole),
  translations: many(organisationI18n)
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
    // Short Name  in {lang}, used in navigation
    nameShort: text('nameShort').notNull(),
    // Description in {lang}
    description: text('description')
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

// Schema for inserting an organisation - can be used to validate API requests
export const insertOrganisationSchema = createInsertSchema(organisation);

// Schema for selecting a user - can be used to validate API responses
export const OrganisationBase = createSelectSchema(organisation);
export const OrganisationI18n = createSelectSchema(organisationI18n);

export const OrganisationSchema = z.object({
  ...OrganisationBase.shape,
  translations: z.array(OrganisationI18n).optional()
});

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
// GEO
/* -------- */

interface GeoProjectMetadata {
  filterProperties?: string[]; // ['district', 'script', 'isPublished']
}

export const project = sqliteTable('project', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  organisationId: text('organisationId')
    .notNull()
    .references(() => organisation.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  // Public identifier
  code: text('code').unique().notNull(),
  // Full Name in English
  name: text('name').notNull(),
  // Short Name in English, used in navigation
  nameShort: text('nameShort').notNull(),
  // Description in English
  description: text('description'),
  // License under which the dataset is made public
  license: text('license').default('Copyright').notNull(),
  // Attribution for the dataset
  attribution: text('attribution').notNull(),
  // Additional Information
  metadata: text('metadata', { mode: 'json' }).$type<GeoProjectMetadata>(),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull()
});

export const projectRelations = relations(project, ({ many }) => ({
  layers: many(layer),
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
    // Short Name  in {lang}, used in navigation
    nameShort: text('nameShort').notNull(),
    // Description in {lang}
    description: text('description'),
    // Licence in {lang}
    license: text('license'),
    // Description in {lang}
    attribution: text('attribution')
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
    role: text('role', { enum: ['member', 'owner', 'admin'] })
      .notNull()
      .default('member')
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

interface GeoCollectionMetadata {
  defaultEnabled: boolean; // true
  mlCluster?: boolean; // false
  mlClusterRadius?: number; // 50
  mlClusterMaxZoom?: number; // 14
  mlClusterMinPoints?: number; // 2
}

/* @geojson/GeometryCollection */
export const layer = sqliteTable('layer', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('projectId')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  // Full Name in English
  name: text('name').notNull(),
  // Short Name in English, used in controls and legends
  nameShort: text('nameShort').notNull(),
  // Description in English
  description: text('description'),
  // Additional Information
  metadata: text('metadata', { mode: 'json' }).$type<GeoCollectionMetadata>(),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull()
});

export const layerRelations = relations(layer, ({ many }) => ({
  posts: many(feature)
}));

interface GeoFeatureProperties {
  // Title
  title: string;
  'title__zh-hant': string;
  'title__zh-hans': string;
  titleGen: boolean;
  'titleGen__zh-hant': boolean;

  // Description
  description?: string;
  'description__zh-hant'?: string;
  'description__zh-hans'?: string;
  descriptionGen?: boolean;
  'descriptionGen__zh-hant'?: boolean;

  // Misc
  grade?: number; // Value between 1 and 5

  // Markers
  markerSize?: string; // small, medium, large
  markerSymbol?: string;
  markerColor?: string; // "#fff"
}

interface GhostSignsGeoFeatureProperties extends GeoFeatureProperties {
  // Description
  graphemes?: string; // Literal

  // Misc
  size?: string; // large, medium, small
  material?: string; // Painted on Cement, Painted on Metal, Painted on Brick, Painted on Tile, Painted over, Acrylic, Metal, Wood, Terrazzo, Stone, Molded Cement, Zinc Stenciled
  visibility?: string; // Revenant, Physical, Palimpsest, Uncovering
}

interface AddressProperties {
  // Metrics
  distanceFromPoint?: number;

  // Display Address
  formattedAddress?: string;
  'formattedAddress__zh-hant'?: string;
  'formattedAddress__zh-hans'?: string;

  // Address Components
  plusCode?: string;
  'plusCode__zh-hant'?: string;
  'plusCode__zh-hans'?: string;

  subPremise?: string;
  'subPremise__zh-hant'?: string;
  'subPremise__zh-hans'?: string;

  premise?: string;
  'premise__zh-hant'?: string;
  'premise__zh-hans'?: string;

  streetNumber?: string;
  'streetNumber__zh-hant'?: string;
  'streetNumber__zh-hans'?: string;

  route?: string;
  'route__zh-hant'?: string;
  'route__zh-hans'?: string;

  intersection?: string;
  'intersection__zh-hant'?: string;
  'intersection__zh-hans'?: string;

  neighbourhood?: string;
  'neighbourhood__zh-hant'?: string;
  'neighbourhood__zh-hans'?: string;

  administrativeAreaLevel1?: string;
  'administrativeAreaLevel1__zh-hant'?: string;
  'administrativeAreaLevel1__zh-hans'?: string;

  country?: string;
  'country__zh-hant'?: string;
  'country__zh-hans'?: string;

  // Identifier
  googlePlaceId?: string;

  // Metadata
  addressGeocoder: string; // The Geocoder used are the source
  addressReverseGen: boolean; // Were the address components generator by a Reverse Geocoder
  addressForwardGen: boolean; // Were the address components generated by a Forward Geocoder
}

/* @geojson/Feature */
export const feature = sqliteTable('feature', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  geometry: text('geometry', { mode: 'json' }).notNull().$type<GeometryObject>(),
  properties: text('properties', { mode: 'json' })
    .notNull()
    .$type<GhostSignsGeoFeatureProperties>(),
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
  isVisitable: integer('isVisitable', { mode: 'boolean' }).notNull().default(false),
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
  })
}));

// TODO Add visit table linking Users with GeoFeatures for a given date
// TODO When a new visit is created for a GeoFeature, update its "visitableAsOf" field to that date.
// TODO Add a checkinType of values "visit" and "reportMissing"
// TODO Add a isHandled to indicate that follow up action was taken (e.g. report missing was dealt with)
