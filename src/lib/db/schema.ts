/* eslint-disable @typescript-eslint/no-unused-vars */
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { AdapterAccountType } from '@auth/core/adapters';
import { relations, sql } from 'drizzle-orm';
import type { GeoJsonProperties, GeometryObject } from 'geojson';

/* ----------------- */
// USERS
/* -------- */

export const users = sqliteTable('user', {
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
    .$onUpdate(() => new Date())
    .notNull()
});

export const userActivity = sqliteTable('userActivity', {
  userId: text('userId')
    .primaryKey()
    .references(() => users.id, { onUpdate: 'cascade', onDelete: 'cascade' }),
  loginCount: integer('loginCount')
    .default(sql`0`)
    .$onUpdateFn(() => sql`login_count + 1`),
  lastLogin: text('lastLogin')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date())
});

/* ----------------- */
// AUTH
/* -------- */

export const accounts = sqliteTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
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

export const sessions = sqliteTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
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
  maintainerId: text('maintainerId').references(() => users.id, { onDelete: 'set null' })
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
export const geoCollections = sqliteTable('geoCollection', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  geometry: text('geometry', { mode: 'json' }).$type<GeometryObject>(),
  metadata: text('metadata', { mode: 'json' }).$type<GeoCollectionMetadata>()
});

export const geoCollectionRelations = relations(geoCollections, ({ many }) => ({
  posts: many(geoFeatures)
}));

interface GeoFeatureProperties {
  title: string;
  description?: string;
  markerSize?: string; // small, medium, large
  markerSymbol?: string;
  markerColor?: string; // "#fff"
}

/* @geojson/Feature */
export const geoFeatures = sqliteTable('geoFeature', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  geometry: text('geometry', { mode: 'json' }).notNull().$type<GeometryObject>(),
  properties: text('properties', { mode: 'json' }).notNull().$type<GeoJsonProperties>(),
  geoCollectionId: text('geoCollectionId')
    .notNull()
    .references(() => geoCollections.id, { onDelete: 'cascade' }),
  contributorId: text('contributorId').references(() => users.id, { onDelete: 'set null' }),
  publisherId: text('publisherId').references(() => users.id, { onDelete: 'set null' }),
  isPublished: integer('isPublished', { mode: 'boolean' }).default(false),
  lastSeen: text('lastSeen').default(sql`(CURRENT_DATE)`)
});

export const geoFeatureRelations = relations(geoFeatures, ({ one }) => ({
  author: one(geoCollections, {
    fields: [geoFeatures.geoCollectionId],
    references: [geoCollections.id]
  })
}));
