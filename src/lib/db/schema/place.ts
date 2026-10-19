// DRIZZLE
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core'
// SCHEMA
import { feature } from './feature'
import { project } from './project'
// TYPES
import type {
  FeaturePlaceOverrides,
  PlaceFacts,
  ProjectPlacePolicy,
} from '#lib/places/model.js'

/** Stable local identity; unresolved and intentional manual Places remain distinct. */
export const place = sqliteTable(
  'place',
  {
    id: text('id').primaryKey(),
    ssId: text('ssId').unique(),
    state: text('state', { enum: ['linked', 'unresolved', 'manual'] }).notNull(),
    // Local baselines are private to their owning project until explicitly published.
    ownerProjectId: text('ownerProjectId').references(() => project.id, {
      onDelete: 'restrict',
    }),
    sourceAvailability: text('sourceAvailability', {
      enum: ['current', 'missing', 'review'],
    })
      .notNull()
      .default('current'),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  table => [
    check(
      'place_state_check',
      sql`${table.state} IN ('linked', 'unresolved', 'manual')`,
    ),
    check(
      'place_identity_check',
      sql`(${table.state} = 'linked' AND ${table.ssId} IS NOT NULL) OR (${table.state} != 'linked' AND ${table.ssId} IS NULL AND ${table.ownerProjectId} IS NOT NULL)`,
    ),
    check(
      'place_availability_check',
      sql`${table.sourceAvailability} IN ('current', 'missing', 'review')`,
    ),
  ],
)

/** Append-only source snapshots or provenance-marked local baselines. */
export const placeRevision = sqliteTable(
  'placeRevision',
  {
    id: text('id').primaryKey(),
    placeId: text('placeId')
      .notNull()
      .references(() => place.id, { onDelete: 'restrict' }),
    sequence: integer('sequence').notNull(),
    origin: text('origin', { enum: ['saanseoi', 'local'] }).notNull(),
    ssId: text('ssId'),
    apiVersion: text('apiVersion'),
    releaseId: text('releaseId'),
    snapshotId: text('snapshotId'),
    contentHash: text('contentHash').notNull(),
    // Raw payload includes source attribution; projection never replaces this evidence.
    payload: text('payload', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull(),
    facts: text('facts', { mode: 'json' }).$type<PlaceFacts>().notNull(),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  table => [
    check('place_revision_payload_json', sql`json_valid(${table.payload})`),
    check('place_revision_facts_json', sql`json_valid(${table.facts})`),
    unique('place_revision_identity').on(table.placeId, table.id),
    unique('place_revision_sequence').on(table.placeId, table.sequence),
    check('place_revision_sequence_check', sql`${table.sequence} > 0`),
    check('place_revision_origin_check', sql`${table.origin} IN ('saanseoi', 'local')`),
    check(
      'place_revision_source_check',
      sql`${table.origin} = 'local' OR (${table.ssId} IS NOT NULL AND ${table.apiVersion} IS NOT NULL AND ${table.releaseId} IS NOT NULL AND ${table.snapshotId} IS NOT NULL)`,
    ),
  ],
)

/** A project policy controls adoption, never shared source snapshot refresh. */
export const projectPlacePolicy = sqliteTable(
  'projectPlacePolicy',
  {
    projectId: text('projectId')
      .primaryKey()
      .references(() => project.id, { onDelete: 'cascade' }),
    policy: text('policy', { mode: 'json' }).$type<ProjectPlacePolicy>().notNull(),
    revision: integer('revision').notNull().default(1),
  },
  table => [
    check('project_place_policy_json', sql`json_valid(${table.policy})`),
    check('project_place_policy_revision_check', sql`${table.revision} > 0`),
  ],
)

/** Feature-local inheritance inputs; existing effective columns remain unchanged. */
export const featurePlace = sqliteTable(
  'featurePlace',
  {
    featureId: text('featureId')
      .primaryKey()
      .references(() => feature.id, { onDelete: 'cascade' }),
    placeId: text('placeId')
      .notNull()
      .references(() => place.id, { onDelete: 'restrict' }),
    factsRevisionId: text('factsRevisionId').notNull(),
    locationRevisionId: text('locationRevisionId').notNull(),
    overrides: text('overrides', { mode: 'json' })
      .$type<FeaturePlaceOverrides>()
      .notNull()
      .default({}),
  },
  table => [
    check('feature_place_overrides_json', sql`json_valid(${table.overrides})`),
    index('feature_place_place').on(table.placeId, table.featureId),
    // Composite references prohibit accidentally adopting another Place's revision.
    foreignKey({
      columns: [table.placeId, table.factsRevisionId],
      foreignColumns: [placeRevision.placeId, placeRevision.id],
    }),
    foreignKey({
      columns: [table.placeId, table.locationRevisionId],
      foreignColumns: [placeRevision.placeId, placeRevision.id],
    }),
  ],
)
