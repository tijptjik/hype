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
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
// SCHEMA
import { feature } from './feature'
import { project } from './project'
// TYPES
import type { PlaceIdentityBaseline } from '#lib/places/identity.js'
import type { SaanSeoiPlaceProjection } from '#lib/places/saanseoi.js'
import type { PlaceAdoptionPlan } from '#lib/places/adoption.js'
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
    state: text('state', {
      enum: ['linked', 'unresolved', 'manual', 'redirect'],
    }).notNull(),
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
      sql`${table.state} IN ('linked', 'unresolved', 'manual', 'redirect')`,
    ),
    check(
      'place_identity_check',
      sql`(${table.state} = 'linked' AND ${table.ssId} IS NOT NULL) OR (${table.state} IN ('unresolved','manual') AND ${table.ssId} IS NULL AND ${table.ownerProjectId} IS NOT NULL) OR (${table.state}='redirect' AND ${table.ssId} IS NULL)`,
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
    revision: text('revision').notNull().default('initial'),
    actorId: text('actorId'),
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

/** Immutable association evidence survives Feature deletion; actor identities are historical. */
export const featurePlaceHistory = sqliteTable(
  'featurePlaceHistory',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    featureId: text('featureId').notNull(),
    revision: text('revision').notNull(),
    previousRevision: text('previousRevision'),
    action: text('action', {
      enum: ['baseline', 'link', 'update', 'unlink'],
    }).notNull(),
    placeId: text('placeId').notNull(),
    factsRevisionId: text('factsRevisionId').notNull(),
    locationRevisionId: text('locationRevisionId').notNull(),
    overrides: text('overrides', { mode: 'json' })
      .$type<FeaturePlaceOverrides>()
      .notNull(),
    actorId: text('actorId'),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  table => [
    index('feature_place_history_feature').on(table.featureId, table.id),
    uniqueIndex('feature_place_history_revision')
      .on(table.featureId, table.revision)
      .where(sql`${table.action} != 'unlink'`),
    check(
      'feature_place_history_action_check',
      sql`${table.action} IN ('baseline', 'link', 'update', 'unlink')`,
    ),
    check('feature_place_history_overrides_json', sql`json_valid(${table.overrides})`),
  ],
)

/** Feature-owned brands retained after explicit unlink; source history remains immutable. */
export const featurePlaceDetached = sqliteTable(
  'featurePlaceDetached',
  {
    featureId: text('featureId')
      .primaryKey()
      .references(() => feature.id, { onDelete: 'cascade' }),
    revision: text('revision').notNull(),
    sourceAssociationRevision: text('sourceAssociationRevision').notNull(),
    actorId: text('actorId').notNull(),
    brands: text('brands', { mode: 'json' }).$type<PlaceFacts['brands']>().notNull(),
  },
  table => [
    check(
      'feature_place_detached_brands_json',
      sql`json_valid(${table.brands}) AND json_type(${table.brands}) = 'array'`,
    ),
  ],
)

/** Immutable assessment, scoped to the Feature's project at proposal time. */
export const placeAdoptionProposal = sqliteTable(
  'placeAdoptionProposal',
  {
    id: text('id').primaryKey(),
    featureId: text('featureId').notNull(),
    projectId: text('projectId').notNull(),
    placeId: text('placeId').notNull(),
    candidateRevisionId: text('candidateRevisionId').notNull(),
    associationRevision: text('associationRevision').notNull(),
    featureModifiedAt: text('featureModifiedAt').notNull(),
    policyRevision: integer('policyRevision').notNull(),
    evidence: text('evidence', { mode: 'json' })
      .$type<{
        policy: ProjectPlacePolicy
        plan: PlaceAdoptionPlan
      }>()
      .notNull(),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  table => [
    unique('place_adoption_candidate').on(
      table.featureId,
      table.projectId,
      table.placeId,
      table.candidateRevisionId,
      table.associationRevision,
      table.featureModifiedAt,
      table.policyRevision,
    ),
    index('place_adoption_project').on(table.projectId, table.featureId),
    check('place_adoption_policy_revision', sql`${table.policyRevision} >= 0`),
    check('place_adoption_evidence_json', sql`json_valid(${table.evidence})`),
  ],
)

/** A field group is pending until an immutable rejection or atomic application is recorded. */
export const placeAdoptionDecision = sqliteTable(
  'placeAdoptionDecision',
  {
    id: text('id').primaryKey(),
    proposalId: text('proposalId')
      .notNull()
      .references(() => placeAdoptionProposal.id, { onDelete: 'restrict' }),
    fieldGroup: text('fieldGroup', { enum: ['facts', 'location'] }).notNull(),
    action: text('action', { enum: ['rejected', 'applied'] }).notNull(),
    actorId: text('actorId').notNull(),
    reason: text('reason').notNull(),
    associationRevision: text('associationRevision').notNull(),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  table => [
    unique('place_adoption_group_decision').on(table.proposalId, table.fieldGroup),
    check('place_adoption_group', sql`${table.fieldGroup} IN ('facts','location')`),
    check('place_adoption_action', sql`${table.action} IN ('rejected','applied')`),
    check(
      'place_adoption_reason',
      sql`length(trim(${table.reason})) BETWEEN 1 AND 2000`,
    ),
  ],
)

/** Reviewed identity transitions retain the local Place and immutable source evidence. */
export const placeIdentityHistory = sqliteTable(
  'placeIdentityHistory',
  {
    id: text('id').primaryKey(),
    placeId: text('placeId')
      .notNull()
      .references(() => place.id, { onDelete: 'restrict' }),
    previousHistoryId: text('previousHistoryId'),
    previousState: text('previousState', {
      enum: ['manual', 'unresolved', 'linked'],
    }).notNull(),
    previousSsId: text('previousSsId'),
    ssId: text('ssId').notNull(),
    sourceRevisionId: text('sourceRevisionId').notNull(),
    actorId: text('actorId').notNull(),
    reason: text('reason').notNull(),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    reviewId: text('reviewId').references(() => placeIdentityReview.id, {
      onDelete: 'restrict',
    }),
  },
  table => [
    foreignKey({ columns: [table.previousHistoryId], foreignColumns: [table.id] }),
    foreignKey({
      columns: [table.placeId, table.sourceRevisionId],
      foreignColumns: [placeRevision.placeId, placeRevision.id],
    }),
    index('place_identity_history_place').on(table.placeId, table.createdAt, table.id),
    uniqueIndex('place_identity_history_previous')
      .on(table.previousHistoryId)
      .where(sql`${table.previousHistoryId} IS NOT NULL`),
    uniqueIndex('place_identity_history_initial')
      .on(table.placeId)
      .where(sql`${table.previousHistoryId} IS NULL`),
    check(
      'place_identity_history_state',
      sql`${table.previousState} IN ('manual','unresolved','linked')`,
    ),
    check('place_identity_history_actor', sql`length(trim(${table.actorId})) > 0`),
    check(
      'place_identity_history_reason',
      sql`length(trim(${table.reason})) BETWEEN 1 AND 2000`,
    ),
    check(
      'place_identity_history_source',
      sql`(${table.previousState} = 'linked' AND ${table.previousSsId} IS NOT NULL) OR (${table.previousState} != 'linked' AND ${table.previousSsId} IS NULL)`,
    ),
  ],
)

/** Server-captured candidate evidence; client decisions refer only to this immutable ID. */
export const placeIdentityReview = sqliteTable(
  'placeIdentityReview',
  {
    id: text('id').primaryKey(),
    placeId: text('placeId')
      .notNull()
      .references(() => place.id, { onDelete: 'restrict' }),
    ownerProjectId: text('ownerProjectId'),
    baseline: text('baseline', { mode: 'json' })
      .$type<PlaceIdentityBaseline>()
      .notNull(),
    projection: text('projection', { mode: 'json' })
      .$type<SaanSeoiPlaceProjection>()
      .notNull(),
    actorId: text('actorId').notNull(),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  table => [
    index('place_identity_review_place').on(table.placeId, table.createdAt, table.id),
    check('place_identity_review_baseline', sql`json_valid(${table.baseline})`),
    check('place_identity_review_projection', sql`json_valid(${table.projection})`),
    check('place_identity_review_actor', sql`length(trim(${table.actorId})) > 0`),
  ],
)

/** Captured merge impact; both identities and source associations are fenced at acceptance. */
export const placeMergeReview = sqliteTable(
  'placeMergeReview',
  {
    id: text('id').primaryKey(),
    identityReviewId: text('identityReviewId')
      .notNull()
      .references(() => placeIdentityReview.id, { onDelete: 'restrict' }),
    targetPlaceId: text('targetPlaceId')
      .notNull()
      .references(() => place.id, { onDelete: 'restrict' }),
    sourcePlaceId: text('sourcePlaceId')
      .notNull()
      .references(() => place.id, { onDelete: 'restrict' }),
    targetBaseline: text('targetBaseline', { mode: 'json' })
      .$type<PlaceIdentityBaseline>()
      .notNull(),
    sourceBaseline: text('sourceBaseline', { mode: 'json' })
      .$type<PlaceIdentityBaseline>()
      .notNull(),
    sourceFeatureToken: text('sourceFeatureToken').notNull(),
    sourceFeatureCount: integer('sourceFeatureCount').notNull(),
    sourceRevisionId: text('sourceRevisionId').notNull(),
    actorId: text('actorId').notNull(),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  table => [
    foreignKey({
      columns: [table.sourcePlaceId, table.sourceRevisionId],
      foreignColumns: [placeRevision.placeId, placeRevision.id],
    }),
    check('place_merge_distinct', sql`${table.sourcePlaceId}!=${table.targetPlaceId}`),
    check('place_merge_target_json', sql`json_valid(${table.targetBaseline})`),
    check('place_merge_source_json', sql`json_valid(${table.sourceBaseline})`),
    check('place_merge_features_json', sql`json_valid(${table.sourceFeatureToken})`),
    check('place_merge_count', sql`${table.sourceFeatureCount}>=0`),
  ],
)

/** Permanent alias retains absorbed IDs and auditable review/actor evidence. */
export const placeRedirect = sqliteTable(
  'placeRedirect',
  {
    sourcePlaceId: text('sourcePlaceId')
      .primaryKey()
      .references(() => place.id, { onDelete: 'restrict' }),
    targetPlaceId: text('targetPlaceId')
      .notNull()
      .references(() => place.id, { onDelete: 'restrict' }),
    id: text('id').notNull().unique(),
    sourceSsId: text('sourceSsId'),
    reviewId: text('reviewId')
      .notNull()
      .unique()
      .references(() => placeMergeReview.id, { onDelete: 'restrict' }),
    actorId: text('actorId').notNull(),
    reason: text('reason').notNull(),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  table => [
    index('place_redirect_target').on(table.targetPlaceId, table.sourcePlaceId),
    check(
      'place_redirect_distinct',
      sql`${table.sourcePlaceId}!=${table.targetPlaceId}`,
    ),
    check('place_redirect_actor', sql`length(trim(${table.actorId}))>0`),
    check(
      'place_redirect_reason',
      sql`length(trim(${table.reason})) BETWEEN 1 AND 2000`,
    ),
  ],
)
