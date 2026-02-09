import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
// SCHEMA
import { feature } from './feature'
// ENUM
import { ImageCDN, ImageEnv, ImageIntent } from '../../enums'
// TYPES
import type { EXIF } from '../../types'

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
  contributorId: text('contributorId'),
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
  localIsArchived: integer('localIsArchived', { mode: 'boolean' }),
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  modifiedAt: text('modifiedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => new Date().toISOString())
    .notNull(),
})

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
      enum: Object.values(ImageIntent) as [string, ...string[]],
    })
      .default(ImageIntent.undefined)
      .notNull(),
    isPublished: integer('isPublished', { mode: 'boolean' }).default(false).notNull(),
    localIsPublished: integer('localIsPublished', { mode: 'boolean' }),
    publishedAt: text('publishedAt'),
    publisherId: text('publisherId'),
  },
  table => [
    primaryKey({ columns: [table.featureId, table.imageId] }),
    uniqueIndex('canonical_intent')
      .on(table.featureId)
      .where(sql`intent = 'canonical'`),
  ],
)
