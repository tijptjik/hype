// DRIZZLE
import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { feature } from './feature'
// TYPES
import type {
  ResearchConfiguration,
  ResearchLayerOverrides,
} from '#lib/fieldResearch/configuration.js'

/** Project-shared sessions retain their original capture extent after grouping and conversion. */
export const fieldResearchSession = sqliteTable('fieldResearchSession', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  organisationId: text('organisationId').notNull(),
  projectId: text('projectId').notNull(),
  layerId: text('layerId'),
  code: text('code'),
  configurationVersion: integer('configurationVersion').notNull().default(0),
  recordSequence: integer('recordSequence').notNull().default(0),
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

/** A field capture belongs to one shared session. */
export const fieldResearchRecord = sqliteTable(
  'fieldResearchRecord',
  {
    id: text('id').primaryKey(),
    featureId: text('featureId').references(() => feature.id),
    sessionId: text('sessionId')
      .notNull()
      .references(() => fieldResearchSession.id),
  },
  table => [
    index('fieldResearchRecord_session').on(table.sessionId),
    uniqueIndex('fieldResearchRecord_feature').on(table.featureId),
  ],
)

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

/** Original version and exact payload preserved before each configuration replacement. */
export const fieldResearchConfigurationHistory = sqliteTable(
  'fieldResearchConfigurationHistory',
  {
    sessionId: text('sessionId')
      .notNull()
      .references(() => fieldResearchSession.id),
    revision: integer('revision').notNull(),
    schemaVersion: integer('schemaVersion').notNull(),
    code: text('code'),
    configuration: text('configuration'),
    layers: text('layers').notNull(),
  },
  table => [primaryKey({ columns: [table.sessionId, table.revision] })],
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

/** Immutable origin keys select the server-owned namespace of the optional related ID. */
export const featureOrigin = sqliteTable('featureOrigin', {
  featureId: text('featureId').primaryKey(),
  origin: text('origin').notNull(),
  originId: text('originId'),
  recordedAt: text('recordedAt').notNull(),
  recordedBy: text('recordedBy'),
})
