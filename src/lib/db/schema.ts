// noinspection JSUnusedGlobalSymbols

import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { AdapterAccountType } from '@auth/core/adapters';
import { relations, sql } from 'drizzle-orm';
import type { GeometryObject } from 'geojson';

/* ----------------- */
// USERS
/* -------- */

export const user = sqliteTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
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
  memberships: many(organisationRole, { relationName: 'membership' })
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
  members: many(organisationRole, { relationName: 'membership' })
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
  organisation: one(organisation, {
    fields: [organisationRole.organisationId],
    references: [organisation.id]
  }),
  user: one(user, {
    fields: [organisationRole.userId],
    references: [user.id]
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
  title: string;
  description?: string;
  license?: string; // ODbl
  attribution?: string; // © Hong Kong Maritime Museum
  filterProperties?: string[]; // ['district', 'script', 'isPublished']
}

export const geoProject = sqliteTable('geoProject', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  metadata: text('metadata', { mode: 'json' }).$type<GeoProjectMetadata>(),
  maintainerId: text('maintainerId').references(() => user.id, { onDelete: 'set null' }),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull()
});

interface GeoCollectionMetadata {
  title: string;
  description?: string;
  mlCluster?: boolean; // false
  mlClusterRadius?: number; // 50
  mlClusterMaxZoom?: number; // 14
  mlClusterMinPoints?: number; // 2
}

/* @geojson/GeometryCollection */
export const geoCollection = sqliteTable('geoCollection', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  geometry: text('geometry', { mode: 'json' }).$type<GeometryObject>(),
  metadata: text('metadata', { mode: 'json' }).$type<GeoCollectionMetadata>(),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull()
});

export const geoCollectionRelations = relations(geoCollection, ({ many }) => ({
  posts: many(geoFeature)
}));

interface GeoFeatureProperties {
  title: string;
  description?: string;
  markerSize?: string; // small, medium, large
  markerSymbol?: string;
  markerColor?: string; // "#fff"
}

/* @geojson/Feature */
export const geoFeature = sqliteTable('geoFeature', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  geometry: text('geometry', { mode: 'json' }).notNull().$type<GeometryObject>(),
  properties: text('properties', { mode: 'json' }).notNull().$type<GeoFeatureProperties>(),
  geoCollectionId: text('geoCollectionId')
    .notNull()
    .references(() => geoCollection.id, { onDelete: 'cascade' }),
  contributorId: text('contributorId').references(() => user.id, { onDelete: 'set null' }),
  publisherId: text('publisherId').references(() => user.id, { onDelete: 'set null' }),
  isPublished: integer('isPublished', { mode: 'boolean' }).default(false),
  lastSeen: text('lastSeen').default(sql`(CURRENT_DATE)`),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull()
});

export const geoFeatureRelations = relations(geoFeature, ({ one }) => ({
  author: one(geoCollection, {
    fields: [geoFeature.geoCollectionId],
    references: [geoCollection.id]
  })
}));
