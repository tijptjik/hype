// DB
import { nanoid } from 'nanoid'
// ORM
import { integer, sqliteTable, primaryKey, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
// SCHEMA
import { user } from './user'
import { image } from './image'
import { layer } from './layer'
// ENUMS
import { supportedLocales, HubRoleType, HubSubscriptionService } from '../../enums'
// TYPES
import type { HubSubscriptionPlacement } from '../../types'

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
  legalContactAddress: text('legalContactAddress'),
  imageId: text('imageId').references(() => image.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
  }),
  isSubscriptionAvailable: integer('isSubscriptionAvailable', { mode: 'boolean' })
    .notNull()
    .default(false),
  subscriptionService: text('subscriptionService', {
    enum: Object.values(HubSubscriptionService) as [string, ...string[]],
  }).default(HubSubscriptionService.substack),
  subscriptionId: text('subscriptionId'),
  subscriptionSessionCookie: text('subscriptionSessionCookie'),
  subscriptionPlacement: text('subscriptionPlacement', {
    mode: 'json',
  })
    .$type<HubSubscriptionPlacement>()
    .notNull()
    .default({
      hubPanel: false,
      topBar: false,
      menu: true,
    } as HubSubscriptionPlacement),
  isPublished: integer('isPublished', { mode: 'boolean' }).notNull().default(true),
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
    subscriptionBenefits: text('subscriptionBenefits'),
    subscriptionBenefitsGen: integer('subscriptionBenefitsGen', { mode: 'boolean' })
      .notNull()
      .default(false),
    privacyPolicy: text('privacyPolicy'),
    privacyPolicyGen: integer('privacyPolicyGen', { mode: 'boolean' })
      .notNull()
      .default(false),
    termsOfService: text('termsOfService'),
    termsOfServiceGen: integer('termsOfServiceGen', { mode: 'boolean' })
      .notNull()
      .default(false),
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
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    role: text('role', {
      enum: Object.values(HubRoleType) as [string, ...string[]],
    })
      .notNull()
      .default(HubRoleType.admin),
  },
  table => [primaryKey({ columns: [table.hubId, table.userId] })],
)

/**
 * Hub user state
 * @remarks
 * Stores per-user, per-hub UX and subscription state
 */
export const hubUserState = sqliteTable(
  'hubUserState',
  {
    hubId: text('hubId')
      .notNull()
      .references(() => hub.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    subscriptionPromptDismissed: integer('subscriptionPromptDismissed', {
      mode: 'boolean',
    })
      .notNull()
      .default(false),
    subscriptionMember: integer('subscriptionMember', { mode: 'boolean' })
      .notNull()
      .default(false),
    hasAgreedToTerms: integer('hasAgreedToTerms', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: text('createdAt')
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
      .notNull(),
    modifiedAt: text('modifiedAt')
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
      .$onUpdate(() => new Date().toISOString())
      .notNull(),
  },
  table => [primaryKey({ columns: [table.hubId, table.userId] })],
)

/**
 * Hub layer defaults
 * @remarks
 * Stores per-hub default visibility for layers on initial app load.
 */
export const hubLayer = sqliteTable(
  'hubLayer',
  {
    hubId: text('hubId')
      .notNull()
      .references(() => hub.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    layerId: text('layerId')
      .notNull()
      .references(() => layer.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    isDefaultVisible: integer('isDefaultVisible', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  table => [primaryKey({ columns: [table.hubId, table.layerId] })],
)
