import {
  integer,
  primaryKey,
  sqliteTable,
  text
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
// ENUM
import {
  ProjectRoleType,
  supportedLocales
} from '../../enums';

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
  organisationId: text('organisationId').notNull(),
  // Public identifier
  code: text('code').unique().notNull(),
  imageId: text('imageId'),
  // Accessible to the public in the app
  isPublished: integer('isPublished', { mode: 'boolean' }).notNull().default(false),
  publishedAt: text('publishedAt'),
  publisherId: text('publisherId'),
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
    userId: text('userId').notNull(),
    role: text('role', {
      enum: Object.values(ProjectRoleType) as [string, ...string[]]
    })
      .notNull()
      .default(ProjectRoleType.maintainer)
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] })
  ]
); 