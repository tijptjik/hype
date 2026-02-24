import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
// SCHEMA
import { image } from './image'
import { user } from './user'
import { hub } from './hub'
// ENUM
import { OrganisationRoleType, supportedLocales } from '../../enums'
import type { CapabilityDefinitions } from '../../types'

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
 * - Hub assignment and exclusivity
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
    onUpdate: 'cascade',
  }),
  // Hub assignment
  hubId: text('hubId').references(() => hub.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
  }),
  // If true, organisation and all its resources are exclusive to the hub, and not served on core.
  isHubExclusive: integer('isHubExclusive', { mode: 'boolean' })
    .notNull()
    .default(false),
  // If true, organisation and all its resources will be served as part of the core hub.
  isCoreInclusive: integer('isCoreInclusive', { mode: 'boolean' })
    .notNull()
    .default(true),
  // Configurable capability labels and assignable keys for this organisation's projects.
  capabilities: text('capabilities', {
    mode: 'json',
  })
    .$type<CapabilityDefinitions>()
    .notNull()
    .default({} as CapabilityDefinitions),
  isPublished: integer('isPublished', { mode: 'boolean' }).notNull().default(true),
  publishedAt: text('publishedAt'),
  publisherId: text('publisherId').references(() => user.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
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
    .notNull(),
})

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
  table => [primaryKey({ columns: [table.organisationId, table.locale] })],
)

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
    role: text('role', {
      enum: Object.values(OrganisationRoleType) as [string, ...string[]],
    })
      .notNull()
      .default(OrganisationRoleType.member),
  },
  table => [primaryKey({ columns: [table.organisationId, table.userId] })],
)
