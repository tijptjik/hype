// DRIZZLE
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Private sessions retain their original capture extent after grouping and conversion. */
export const fieldResearchSession = sqliteTable('fieldResearchSession', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  organisationId: text('organisationId').notNull(),
  projectId: text('projectId').notNull(),
  layerId: text('layerId'),
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
