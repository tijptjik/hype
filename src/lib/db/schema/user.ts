import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
// SCHEMA
import { feature } from './feature';
import { layer } from './layer';
// ENUM
import { SupportedLocales, supportedLocales } from '../../enums';
// TYPES
import type { UserExperimental, UserPreferences } from '../../types';

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
  emailVerified: integer('emailVerified', { mode: 'boolean' }).default(false),
  image: text('image'),
  locale: text('locale', { enum: ['en', 'zh-hant', 'zh-hans'] })
    .notNull()
    .default(SupportedLocales.en),
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
    .default(sql`'{"contributorMode":false, "noLabelsMode":false}'`)
    .notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
});

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
 * External authentication provider accounts. Compatible with Better-Auth.
 * @remarks
 * Links external authentication providers to user accounts
 */
export const account = sqliteTable('account', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  accessTokenExpiresAt: integer('accessTokenExpiresAt', {
    mode: 'timestamp_ms'
  }).$type<Date>(),
  refreshTokenExpiresAt: integer('refreshTokenExpiresAt', {
    mode: 'timestamp_ms'
  }).$type<Date>(),
  scope: text('scope'),
  idToken: text('idToken'),
  password: text('password'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
});

/**
 * User sessions. Compatible with Better-Auth.
 * @remarks
 * Manages active user sessions and their expiration
 */
export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull().$type<Date>(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
});

/**
 * Verification table for Better-Auth
 * @remarks
 * Stores verification tokens for email verification, password reset, etc.
 */
export const verification = sqliteTable('verification', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull().$type<Date>(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
});

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
