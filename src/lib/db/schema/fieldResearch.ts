// DRIZZLE
import { sql } from 'drizzle-orm'
import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
// TYPES
import type {
  ResearchConfiguration,
  ResearchLayerOverrides,
} from '#lib/fieldResearch/configuration.js'

/** Private sessions retain their original capture extent after grouping and conversion. */
export const fieldResearchSession = sqliteTable('fieldResearchSession', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  organisationId: text('organisationId').notNull(),
  projectId: text('projectId').notNull(),
  layerId: text('layerId'),
  code: text('code'),
  configuration: text('configuration', { mode: 'json' }).$type<
    Omit<ResearchConfiguration, 'code'>
  >(),
  createdBy: text('createdBy').notNull(),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
  completedAt: text('completedAt'),
  isArchived: integer('isArchived', { mode: 'boolean' }).notNull().default(false),
  archivedAt: text('archivedAt'),
  archivedBy: text('archivedBy'),
  status: text('status', { enum: ['uploading', 'organising', 'completed'] }).notNull(),
  revision: integer('revision').notNull().default(0),
  west: real('west'),
  south: real('south'),
  east: real('east'),
  north: real('north'),
})

/** Configured project layers inherit their session defaults unless explicitly overridden. */
export const fieldResearchSessionLayer = sqliteTable(
  'fieldResearchSessionLayer',
  {
    sessionId: text('sessionId').notNull(),
    layerId: text('layerId').notNull(),
    isDefault: integer('isDefault', { mode: 'boolean' }).notNull().default(false),
    overrides: text('overrides', { mode: 'json' })
      .$type<ResearchLayerOverrides>()
      .notNull(),
  },
  table => [
    primaryKey({ columns: [table.sessionId, table.layerId] }),
    uniqueIndex('fieldResearchSessionLayer_default')
      .on(table.sessionId)
      .where(sql`${table.isDefault} = 1`),
  ],
)

/** Locations explicitly vetted for use within a field session. */
export const fieldResearchSessionLocation = sqliteTable(
  'fieldResearchSessionLocation',
  {
    sessionId: text('sessionId').notNull(),
    locationId: text('locationId').notNull(),
  },
  table => [primaryKey({ columns: [table.sessionId, table.locationId] })],
)

/** Working groups exist only inside field research; converted groups retain their Feature receipt. */
export const fieldResearchStack = sqliteTable('fieldResearchStack', {
  id: text('id').primaryKey(),
  sessionId: text('sessionId').notNull(),
  longitude: real('longitude'),
  latitude: real('latitude'),
  featureId: text('featureId'),
  name: text('name'),
  featureType: text('featureType'),
  createdAt: text('createdAt').notNull(),
})

/** Uploaded assets remain independent of the Feature gallery until explicit conversion. */
export const fieldResearchImage = sqliteTable('fieldResearchImage', {
  id: text('id').primaryKey(),
  sessionId: text('sessionId').notNull(),
  stackId: text('stackId'),
  state: text('state', { enum: ['uploading', 'uploaded'] }).notNull(),
  filename: text('filename').notNull(),
  longitude: real('longitude'),
  latitude: real('latitude'),
  capturedAt: text('capturedAt'),
  contentHash: text('contentHash').notNull(),
  storageKey: text('storageKey').notNull(),
  env: text('env').notNull(),
  mediaType: text('mediaType').notNull(),
  byteSize: integer('byteSize').notNull(),
  metadata: text('metadata').notNull(),
  createdAt: text('createdAt').notNull(),
})

/** Immutable origin keys select the server-owned namespace of the optional related ID. */
export const featureOrigin = sqliteTable('featureOrigin', {
  featureId: text('featureId').primaryKey(),
  origin: text('origin').notNull(),
  originId: text('originId'),
  recordedAt: text('recordedAt').notNull(),
  recordedBy: text('recordedBy'),
})
