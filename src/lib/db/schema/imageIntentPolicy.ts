// DRIZZLE
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { hub } from './hub'
import { project } from './project'
// TYPES
import type { ImageIntentDefinition } from '#lib/images/intents.js'

/** Independent Hub catalogues; new Hubs copy the core catalogue once. */
export const hubImageIntentPolicy = sqliteTable('hubImageIntentPolicy', {
  hubId: text('hubId')
    .primaryKey()
    .references(() => hub.id, { onDelete: 'cascade' }),
  intents: text('intents', { mode: 'json' }).$type<ImageIntentDefinition[]>().notNull(),
  redirects: text('redirects', { mode: 'json' })
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  version: integer('version').notNull().default(0),
})

/** Null intents inherit from the current Hub; automatic classification defaults on. */
export const projectImageIntentPolicy = sqliteTable('projectImageIntentPolicy', {
  projectId: text('projectId')
    .primaryKey()
    .references(() => project.id, { onDelete: 'cascade' }),
  intents: text('intents', { mode: 'json' }).$type<ImageIntentDefinition[] | null>(),
  autoPublishUnclassified: integer('autoPublishUnclassified', { mode: 'boolean' })
    .notNull()
    .default(true),
  redirects: text('redirects', { mode: 'json' })
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  version: integer('version').notNull().default(0),
})

/** Attributed settings changes retain labels, publication choices and reassignment decisions. */
export const imageIntentPolicyRevision = sqliteTable('imageIntentPolicyRevision', {
  id: text('id').primaryKey(),
  scopeType: text('scopeType').notNull(),
  scopeId: text('scopeId').notNull(),
  actorId: text('actorId').notNull(),
  createdAt: text('createdAt').notNull(),
  previous: text('previous').notNull(),
  current: text('current').notNull(),
})
