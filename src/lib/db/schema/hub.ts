// DB
import { nanoid } from 'nanoid'
// ORM
import { integer, sqliteTable, primaryKey, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
// ENUMS
import { supportedLocales, HubRoleType } from '../../enums'

/* ============================================================================
 * HUB MANAGEMENT
 * ============================================================================
 * Tables for managing hubs
 */

/**
 * Multi-tenant hub table
 * @remarks
 * Stores hub information and metadata
 * - Basic info (code, domain, name)
 * - Core hub identification
 * - Active status
 */
export const hub = sqliteTable('hub', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid(12)),
  // Subdomain
  code: text('code').unique().notNull(),
  domain: text('domain').unique(),
  isArchived: integer('isArchived', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull(),
})

/**
 * Hub translations
 * @remarks
 * Stores multilingual content for hubs
 */
export const hubI18n = sqliteTable(
  'hubI18n',
  {
    hubId: text('hubId')
      .notNull()
      .references(() => hub.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // IETF BCP 47 language tag
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
  table => [primaryKey({ columns: [table.hubId, table.locale] })],
)

/**
 * Hub role assignments
 * @remarks
 * Links users to hubs with specific roles. This is used for settings superAdmins for Hubs.
 */
export const hubRole = sqliteTable(
  'hubRole',
  {
    hubId: text('hubId')
      .notNull()
      .references(() => hub.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => hub.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    role: text('role', {
      enum: Object.values(HubRoleType) as [string, ...string[]],
    })
      .notNull()
      .default(HubRoleType.admin),
  },
  table => [primaryKey({ columns: [table.hubId, table.userId] })],
)
