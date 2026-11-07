// DRIZZLE
import { sql } from 'drizzle-orm'
import {
  check,
  customType,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
// DOMAIN
import {
  readLocationFacts,
  serializeLocationFacts,
} from '#lib/locations/factsSnapshot.js'
import { LOCATION_KINDS } from '#lib/locations/kinds.js'
// SCHEMA
import { feature } from './feature'
import { organisation } from './organisation'
// TYPES
import type { LocationIdentityBaseline } from '#lib/locations/identity.js'
import type { SaanSeoiPlaceProjection } from '#lib/locations/saanseoi.js'
import type { StoredLocationAdoptionPlan } from '#lib/locations/adoption.js'
import type {
  FeatureLocationOverrides,
  LocationFacts,
  ProjectLocationPolicy,
} from '#lib/locations/model.js'

/** Shared Location identity with authored entity types independent of matching state. */
export const location = sqliteTable(
  'location',
  {
    id: text('id').primaryKey(),
    ssId: text('ssId').unique(),
    kind: text('kind', { enum: LOCATION_KINDS }).notNull().default('unknown'),
    // Ownership grants baseline authority. Only manual Locations are private; unmatched are shared.
    ownerOrganisationId: text('ownerOrganisationId').references(() => organisation.id, {
      onDelete: 'restrict',
    }),
    state: text('state', {
      enum: ['linked', 'unresolved', 'manual', 'redirect'],
    }).notNull(),
    sourceAvailability: text('sourceAvailability', {
      enum: ['current', 'missing', 'review'],
    })
      .notNull()
      .default('current'),
    redirectTargetId: text('redirectTargetId'),
    redirect: text('redirect', { mode: 'json' }).$type<LocationRedirectRecord>(),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  table => [
    check(
      'location_kind_check',
      sql`${table.kind} IN ('unknown','premises','establishment','building','address','natural')`,
    ),
    check(
      'location_state_check',
      sql`${table.state} IN ('linked', 'unresolved', 'manual', 'redirect')`,
    ),
    check(
      'location_identity_check',
      sql`(${table.state} = 'linked' AND ${table.ssId} IS NOT NULL) OR (${table.state} IN ('unresolved','manual') AND ${table.ssId} IS NULL AND ${table.ownerOrganisationId} IS NOT NULL) OR (${table.state}='redirect' AND ${table.ssId} IS NULL)`,
    ),
    check(
      'location_availability_check',
      sql`${table.sourceAvailability} IN ('current', 'missing', 'review')`,
    ),
  ],
)

/** Persist a versioned envelope while exposing the existing normalized application projection. */
const locationFacts = customType<{ data: LocationFacts; driverData: string }>({
  dataType: () => 'text',
  fromDriver: readLocationFacts,
  toDriver: value => serializeLocationFacts(value),
})

/** Append-only source snapshots or provenance-marked local baselines. */
export const locationRevision = sqliteTable(
  'locationRevision',
  {
    id: text('id').primaryKey(),
    locationId: text('locationId')
      .notNull()
      .references(() => location.id, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    origin: text('origin', { enum: ['saanseoi', 'local'] }).notNull(),
    ssId: text('ssId'),
    apiVersion: text('apiVersion'),
    releaseId: text('releaseId'),
    snapshotId: text('snapshotId'),
    contentHash: text('contentHash').notNull(),
    // Raw rawSource includes source attribution; projection never replaces this evidence.
    rawSource: text('rawSource', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull(),
    facts: locationFacts('facts').notNull(),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  table => [
    check('location_revision_payload_json', sql`json_valid(${table.rawSource})`),
    check('location_revision_facts_json', sql`json_valid(${table.facts})`),
    unique('location_revision_identity').on(table.locationId, table.id),
    unique('location_revision_sequence').on(table.locationId, table.version),
    check('location_revision_sequence_check', sql`${table.version} > 0`),
    check(
      'location_revision_origin_check',
      sql`${table.origin} IN ('saanseoi', 'local')`,
    ),
    check(
      'location_revision_source_check',
      sql`${table.origin} = 'local' OR (${table.ssId} IS NOT NULL AND ${table.apiVersion} IS NOT NULL AND ${table.releaseId} IS NOT NULL AND ${table.snapshotId} IS NOT NULL)`,
    ),
  ],
)

/** Accepted baseline and Organisation correction snapshots for one Feature. */
export const featureLocation = sqliteTable(
  'featureLocation',
  {
    featureId: text('featureId')
      .primaryKey()
      .references(() => feature.id, { onDelete: 'cascade' }),
    locationId: text('locationId')
      .notNull()
      .references(() => location.id, { onDelete: 'restrict' }),
    version: text('version').notNull().default('initial'),
    actorId: text('actorId'),
    factsRevisionId: text('factsRevisionId').notNull(),
    locationRevisionId: text('locationRevisionId').notNull(),
    // Accepted Organisation correction snapshot; this is a projection, not a Feature-owned override.
    overrides: text('acceptedOverrides', { mode: 'json' })
      .$type<FeatureLocationOverrides>()
      .notNull()
      .default({}),
    factsOrganisationRevision: text('factsOrganisationRevision'),
    locationOrganisationRevision: text('locationOrganisationRevision'),
    occupancyRevisionId: text('occupancyRevisionId'),
    addressRevisionId: text('addressRevisionId'),
    membershipRevisionIds: text('membershipRevisionIds', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    placementOverrides: text('placementOverrides', { mode: 'json' })
      .$type<{ accessHints?: Record<string, string | null> }>()
      .notNull()
      .default({}),
    acceptedGeometry: text('acceptedGeometry', { mode: 'json' }).$type<
      import('geojson').Point
    >(),
    acceptancePolicy: text('acceptancePolicy', { mode: 'json' }).$type<
      Record<string, unknown>
    >(),
    acceptanceProposalId: text('acceptanceProposalId'),
  },
  table => [
    check('feature_location_overrides_json', sql`json_valid(${table.overrides})`),
    index('feature_location_location').on(table.locationId, table.featureId),
    // Composite references prohibit accidentally adopting another Location's revision.
    foreignKey({
      columns: [table.locationId, table.factsRevisionId],
      foreignColumns: [locationRevision.locationId, locationRevision.id],
    }),
    foreignKey({
      columns: [table.locationId, table.locationRevisionId],
      foreignColumns: [locationRevision.locationId, locationRevision.id],
    }),
  ],
)

/** Immutable association evidence survives Feature deletion; actor identities are historical. */
export const featureLocationHistory = sqliteTable(
  'featureLocationHistory',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    featureId: text('featureId').notNull(),
    version: text('version').notNull(),
    previousRevision: text('previousRevision'),
    action: text('action', {
      enum: ['baseline', 'link', 'update', 'unlink'],
    }).notNull(),
    locationId: text('locationId').notNull(),
    factsRevisionId: text('factsRevisionId').notNull(),
    locationRevisionId: text('locationRevisionId').notNull(),
    // Accepted Organisation correction snapshot; this is a projection, not a Feature-owned override.
    overrides: text('acceptedOverrides', { mode: 'json' })
      .$type<FeatureLocationOverrides>()
      .notNull(),
    actorId: text('actorId'),
    factsOrganisationRevision: text('factsOrganisationRevision'),
    locationOrganisationRevision: text('locationOrganisationRevision'),
    occupancyRevisionId: text('occupancyRevisionId'),
    addressRevisionId: text('addressRevisionId'),
    membershipRevisionIds: text('membershipRevisionIds', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    placementOverrides: text('placementOverrides', { mode: 'json' })
      .$type<{ accessHints?: Record<string, string | null> }>()
      .notNull()
      .default({}),
    geometry: text('geometry', { mode: 'json' }).$type<import('geojson').Point>(),
    policySnapshot: text('policySnapshot', { mode: 'json' }).$type<
      Record<string, unknown>
    >(),
    adoptionProposalId: text('adoptionProposalId'),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  table => [
    index('feature_location_history_feature').on(table.featureId, table.id),
    uniqueIndex('feature_location_history_revision')
      .on(table.featureId, table.version)
      .where(sql`${table.action} != 'unlink'`),
    check(
      'feature_location_history_action_check',
      sql`${table.action} IN ('baseline', 'link', 'update', 'unlink')`,
    ),
    check(
      'feature_location_history_overrides_json',
      sql`json_valid(${table.overrides})`,
    ),
  ],
)

/** Immutable assessment, scoped to the Feature's project at proposal time. */
export const locationAdoptionProposal = sqliteTable(
  'locationAdoptionProposal',
  {
    id: text('id').primaryKey(),
    featureId: text('featureId').notNull(),
    projectId: text('projectId').notNull(),
    locationId: text('locationId').notNull(),
    candidateRevisionId: text('candidateRevisionId').notNull(),
    associationRevision: text('associationRevision').notNull(),
    featureModifiedAt: text('featureModifiedAt').notNull(),
    policyRevision: integer('policyRevision').notNull(),
    evidence: text('evidence', { mode: 'json' })
      .$type<{
        policy: ProjectLocationPolicy
        plan: StoredLocationAdoptionPlan
        candidateOverrides?: FeatureLocationOverrides
        placement?: import('#lib/locations/placement.js').PlacementEvidence
      }>()
      .notNull(),
    organisationRevision: text('organisationRevision').notNull().default(''),
    factsDecision: text('factsDecision', {
      mode: 'json',
    }).$type<LocationAdoptionDecisionRecord>(),
    locationDecision: text('locationDecision', {
      mode: 'json',
    }).$type<LocationAdoptionDecisionRecord>(),
    occupancyRevisionId: text('occupancyRevisionId'),
    addressRevisionId: text('addressRevisionId'),
    layerId: text('layerId'),
    layerPolicyRevision: integer('layerPolicyRevision'),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  table => [
    uniqueIndex('location_adoption_candidate').on(
      table.featureId,
      table.projectId,
      table.locationId,
      table.candidateRevisionId,
      table.associationRevision,
      table.featureModifiedAt,
      table.policyRevision,
      table.organisationRevision,
      sql`COALESCE(${table.occupancyRevisionId},'')`,
      sql`COALESCE(${table.addressRevisionId},'')`,
      sql`COALESCE(${table.layerId},'')`,
      sql`COALESCE(${table.layerPolicyRevision},-1)`,
    ),
    index('location_adoption_project').on(table.projectId, table.featureId),
    check('location_adoption_policy_revision', sql`${table.policyRevision} >= 0`),
    check('location_adoption_evidence_json', sql`json_valid(${table.evidence})`),
  ],
)

/** Immutable group decision embedded in its assessment. */
export type LocationAdoptionDecisionRecord = {
  id: string
  proposalId: string
  fieldGroup: 'facts' | 'location'
  action: 'rejected' | 'applied'
  actorId: string
  reason: string
  associationRevision: string
  createdAt: string
}

/** Reviewed identity transitions retain the local Location and immutable source evidence. */
export const locationIdentityHistory = sqliteTable(
  'locationIdentityHistory',
  {
    id: text('id').primaryKey(),
    locationId: text('locationId')
      .notNull()
      .references(() => location.id, { onDelete: 'restrict' }),
    previousHistoryId: text('previousHistoryId'),
    previousState: text('previousState', {
      enum: ['manual', 'unresolved', 'linked'],
    }).notNull(),
    previousSsId: text('previousSsId'),
    ssId: text('ssId').notNull(),
    sourceRevisionId: text('sourceRevisionId').notNull(),
    actorId: text('actorId').notNull(),
    reason: text('reason').notNull(),
    reviewId: text('reviewId').references(() => locationIdentityReview.id, {
      onDelete: 'restrict',
    }),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  table => [
    foreignKey({ columns: [table.previousHistoryId], foreignColumns: [table.id] }),
    foreignKey({
      columns: [table.locationId, table.sourceRevisionId],
      foreignColumns: [locationRevision.locationId, locationRevision.id],
    }),
    index('location_identity_history_location').on(
      table.locationId,
      table.createdAt,
      table.id,
    ),
    uniqueIndex('location_identity_history_previous')
      .on(table.previousHistoryId)
      .where(sql`${table.previousHistoryId} IS NOT NULL`),
    uniqueIndex('location_identity_history_initial')
      .on(table.locationId)
      .where(sql`${table.previousHistoryId} IS NULL`),
    check(
      'location_identity_history_state',
      sql`${table.previousState} IN ('manual','unresolved','linked')`,
    ),
    check('location_identity_history_actor', sql`length(trim(${table.actorId})) > 0`),
    check(
      'location_identity_history_reason',
      sql`length(trim(${table.reason})) BETWEEN 1 AND 2000`,
    ),
    check(
      'location_identity_history_source',
      sql`(${table.previousState} = 'linked' AND ${table.previousSsId} IS NOT NULL) OR (${table.previousState} != 'linked' AND ${table.previousSsId} IS NULL)`,
    ),
  ],
)

/** Server-captured candidate evidence; client decisions refer only to this immutable ID. */
export const locationIdentityReview = sqliteTable(
  'locationIdentityReview',
  {
    id: text('id').primaryKey(),
    locationId: text('locationId')
      .notNull()
      .references(() => location.id, { onDelete: 'restrict' }),
    ownerOrganisationId: text('ownerOrganisationId'),
    baseline: text('baseline', { mode: 'json' })
      .$type<LocationIdentityBaseline>()
      .notNull(),
    projection: text('projection', { mode: 'json' })
      .$type<SaanSeoiPlaceProjection>()
      .notNull(),
    actorId: text('actorId').notNull(),
    mergeReviews: text('mergeReviews', { mode: 'json' })
      .$type<LocationMergeReviewRecord[]>()
      .notNull()
      .default(sql`'[]'`),
    rejection: text('rejection', {
      mode: 'json',
    }).$type<LocationIdentityRejectionRecord>(),
    createdAt: text('createdAt')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  table => [
    index('location_identity_review_location').on(
      table.locationId,
      table.createdAt,
      table.id,
    ),
    check('location_identity_review_baseline', sql`json_valid(${table.baseline})`),
    check('location_identity_review_projection', sql`json_valid(${table.projection})`),
    check('location_identity_review_actor', sql`length(trim(${table.actorId})) > 0`),
  ],
)

/** Immutable merge impact versions retained within their identity comparison. */
export type LocationMergeReviewRecord = {
  dependencies?: import('#lib/locations/merge.types.js').LocationMergeImpact
  id: string
  identityReviewId: string
  targetLocationId: string
  sourceLocationId: string
  targetBaseline: LocationIdentityBaseline
  sourceBaseline: LocationIdentityBaseline
  sourceFeatureToken: string
  sourceFeatureCount: number
  sourceRevisionId: string
  actorId: string
  createdAt: string
}

/** Permanent receipt stored on the absorbed Location. */
export type LocationRedirectRecord = {
  id: string
  sourceLocationId: string
  targetLocationId: string
  sourceSsId: string | null
  reviewId: string
  actorId: string
  reason: string
  createdAt: string
}

/** Negative decision retained with the comparison it rejects. */
export type LocationIdentityRejectionRecord = {
  reviewId: string
  locationId: string
  ssId: string
  actorId: string
  reason: string
  createdAt: string
}

/** Immutable Organisation corrections; heads are rows without a successor. */
export const organisationLocation = sqliteTable(
  'organisationLocation',
  {
    revision: text('id').primaryKey(),
    organisationId: text('organisationId')
      .notNull()
      .references(() => organisation.id, { onDelete: 'restrict' }),
    locationId: text('locationId')
      .notNull()
      .references(() => location.id, { onDelete: 'restrict' }),
    previousRevisionId: text('previousRevisionId'),
    overrides: text('overrides', { mode: 'json' })
      .$type<FeatureLocationOverrides>()
      .notNull(),
    provenance: text('provenance', { mode: 'json' }).$type<Record<string, unknown>>(),
    actorId: text('actorId').notNull(),
    createdAt: text('createdAt').notNull(),
  },
  table => [
    uniqueIndex('organisation_location_root')
      .on(table.organisationId, table.locationId)
      .where(sql`${table.previousRevisionId} IS NULL`),
    uniqueIndex('organisation_location_successor')
      .on(table.previousRevisionId)
      .where(sql`${table.previousRevisionId} IS NOT NULL`),
  ],
)

/** Immutable correction version retained in its Organisation–Location association. */
export type OrganisationLocationRevision = {
  version: string
  provenance?: Record<string, unknown>
  overrides: FeatureLocationOverrides
  actorId: string
  createdAt: string
}
