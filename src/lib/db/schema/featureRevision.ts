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
// TYPES
import type { RevisionValue, RevisionResolution } from '#lib/revisions/merge.js'

/** Durable operation attribution; historical actors are not cascading user references. */
export const revisionChangeSet = sqliteTable(
  'revisionChangeSet',
  {
    id: text('id').primaryKey(),
    actorId: text('actorId').notNull(),
    origin: text('origin', {
      enum: ['user', 'system', 'import', 'migration', 'restore'],
    }).notNull(),
    reason: text('reason'),
    createdAt: text('createdAt').notNull(),
  },
  table => [
    check('revision_actor_required', sql`length(trim(${table.actorId})) > 0`),
    check(
      'revision_origin',
      sql`${table.origin} IN ('user','system','import','migration','restore')`,
    ),
  ],
)

/** Immutable authored snapshot; application query tables remain the public projection. */
export const featureRevision = sqliteTable(
  'featureRevision',
  {
    id: text('id').primaryKey(),
    featureId: text('featureId')
      .notNull()
      .references(() => feature.id, { onDelete: 'restrict' }),
    previousRevisionId: text('previousRevisionId'),
    mergedFromRevisionId: text('mergedFromRevisionId'),
    changeSetId: text('changeSetId')
      .notNull()
      .references(() => revisionChangeSet.id, { onDelete: 'restrict' }),
    schemaVersion: integer('schemaVersion').notNull().default(1),
    content: text('content', { mode: 'json' }).$type<RevisionValue>().notNull(),
  },
  table => [
    unique('feature_revision_owner').on(table.featureId, table.id),
    foreignKey({
      columns: [table.featureId, table.previousRevisionId],
      foreignColumns: [table.featureId, table.id],
    }),
    foreignKey({
      columns: [table.featureId, table.mergedFromRevisionId],
      foreignColumns: [table.featureId, table.id],
    }),
    check('feature_revision_content_json', sql`json_valid(${table.content})`),
    check('feature_revision_schema_version', sql`${table.schemaVersion} = 1`),
    check(
      'feature_revision_no_self_parent',
      sql`${table.previousRevisionId} IS NOT ${table.id} AND ${table.mergedFromRevisionId} IS NOT ${table.id}`,
    ),
  ],
)

/** Current publication and lifecycle; no accepted-but-unpublished working head exists. */
export const featureRevisionHead = sqliteTable(
  'featureRevisionHead',
  {
    featureId: text('featureId')
      .primaryKey()
      .references(() => feature.id, { onDelete: 'restrict' }),
    publishedRevisionId: text('publishedRevisionId'),
    state: text('state', { enum: ['active', 'merged', 'split'] })
      .notNull()
      .default('active'),
    redirectFeatureId: text('redirectFeatureId').references(() => feature.id, {
      onDelete: 'restrict',
    }),
    // Monotonic fencing token prevents an unpublish/republish ABA race.
    generation: integer('generation').notNull().default(0),
  },
  table => [
    foreignKey({
      columns: [table.featureId, table.publishedRevisionId],
      foreignColumns: [featureRevision.featureId, featureRevision.id],
    }),
    check(
      'feature_head_state',
      sql`(${table.state} = 'active' AND ${table.redirectFeatureId} IS NULL) OR (${table.state} = 'merged' AND ${table.redirectFeatureId} IS NOT NULL AND ${table.redirectFeatureId} != ${table.featureId} AND ${table.publishedRevisionId} IS NULL) OR (${table.state} = 'split' AND ${table.redirectFeatureId} IS NULL AND ${table.publishedRevisionId} IS NULL)`,
    ),
    check('feature_head_generation', sql`${table.generation} >= 0`),
  ],
)

/** One independent contribution branch; submitted snapshots cannot be amended in place. */
export const featureRevisionProposal = sqliteTable(
  'featureRevisionProposal',
  {
    id: text('id').primaryKey(),
    featureId: text('featureId')
      .notNull()
      .references(() => feature.id, { onDelete: 'restrict' }),
    baseRevisionId: text('baseRevisionId').notNull(),
    candidateRevisionId: text('candidateRevisionId').notNull(),
    contributorId: text('contributorId').notNull(),
    status: text('status', {
      enum: ['draft', 'submitted', 'accepted', 'rejected', 'withdrawn'],
    }).notNull(),
    createdChangeSetId: text('createdChangeSetId')
      .notNull()
      .references(() => revisionChangeSet.id),
  },
  table => [
    foreignKey({
      columns: [table.featureId, table.baseRevisionId],
      foreignColumns: [featureRevision.featureId, featureRevision.id],
    }),
    foreignKey({
      columns: [table.featureId, table.candidateRevisionId],
      foreignColumns: [featureRevision.featureId, featureRevision.id],
    }),
    unique('feature_proposal_owner').on(table.featureId, table.id),
    check(
      'feature_proposal_status',
      sql`${table.status} IN ('draft','submitted','accepted','rejected','withdrawn')`,
    ),
    check(
      'feature_proposal_candidate',
      sql`${table.baseRevisionId} != ${table.candidateRevisionId}`,
    ),
    index('feature_proposal_queue').on(table.status, table.featureId),
  ],
)

/** Append-only workflow evidence, including rejected and withdrawn proposals. */
export const featureRevisionReview = sqliteTable(
  'featureRevisionReview',
  {
    id: text('id').primaryKey(),
    featureId: text('featureId').notNull(),
    proposalId: text('proposalId').notNull(),
    candidateRevisionId: text('candidateRevisionId').notNull(),
    comparedRevisionId: text('comparedRevisionId'),
    resultingRevisionId: text('resultingRevisionId'),
    action: text('action', {
      enum: ['created', 'saved', 'submitted', 'accepted', 'rejected', 'withdrawn'],
    }).notNull(),
    changeSetId: text('changeSetId')
      .notNull()
      .references(() => revisionChangeSet.id),
    resolutions: text('resolutions', { mode: 'json' })
      .$type<readonly RevisionResolution[]>()
      .notNull()
      .default([]),
  },
  table => [
    foreignKey({
      columns: [table.featureId, table.proposalId],
      foreignColumns: [featureRevisionProposal.featureId, featureRevisionProposal.id],
    }),
    foreignKey({
      columns: [table.featureId, table.candidateRevisionId],
      foreignColumns: [featureRevision.featureId, featureRevision.id],
    }),
    foreignKey({
      columns: [table.featureId, table.comparedRevisionId],
      foreignColumns: [featureRevision.featureId, featureRevision.id],
    }),
    foreignKey({
      columns: [table.featureId, table.resultingRevisionId],
      foreignColumns: [featureRevision.featureId, featureRevision.id],
    }),
    check(
      'feature_review_result',
      sql`(${table.action} = 'accepted' AND ${table.resultingRevisionId} IS NOT NULL) OR (${table.action} IN ('created','saved','submitted','rejected','withdrawn') AND ${table.resultingRevisionId} IS NULL)`,
    ),
    check('feature_review_resolutions', sql`json_valid(${table.resolutions})`),
    uniqueIndex('feature_review_final_decision')
      .on(table.proposalId)
      .where(sql`${table.action} IN ('accepted','rejected','withdrawn')`),
  ],
)

/** Publication receipts are distinct from authoring and preserve previous heads. */
export const featureRevisionPublication = sqliteTable(
  'featureRevisionPublication',
  {
    id: text('id').primaryKey(),
    featureId: text('featureId')
      .notNull()
      .references(() => feature.id, { onDelete: 'restrict' }),
    previousRevisionId: text('previousRevisionId'),
    revisionId: text('revisionId'),
    generation: integer('generation').notNull(),
    changeSetId: text('changeSetId')
      .notNull()
      .references(() => revisionChangeSet.id),
  },
  table => [
    foreignKey({
      columns: [table.featureId, table.previousRevisionId],
      foreignColumns: [featureRevision.featureId, featureRevision.id],
    }),
    foreignKey({
      columns: [table.featureId, table.revisionId],
      foreignColumns: [featureRevision.featureId, featureRevision.id],
    }),
    unique('feature_publication_generation').on(table.featureId, table.generation),
  ],
)

/** Immutable identity-operation receipt; links explicitly span feature identities. */
export const featureIdentityOperation = sqliteTable(
  'featureIdentityOperation',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ['merge', 'split'] }).notNull(),
    changeSetId: text('changeSetId')
      .notNull()
      .references(() => revisionChangeSet.id),
    // Reviewed dependent-record dispositions are evidence, never implicit transfer instructions.
    dispositions: text('dispositions', { mode: 'json' })
      .$type<RevisionValue>()
      .notNull(),
  },
  table => [
    check('feature_identity_kind', sql`${table.kind} IN ('merge','split')`),
    check('feature_identity_dispositions', sql`json_valid(${table.dispositions})`),
  ],
)

/** Inputs retain consumed heads; outputs identify published successors, including survivors. */
export const featureIdentityOperationMember = sqliteTable(
  'featureIdentityOperationMember',
  {
    operationId: text('operationId')
      .notNull()
      .references(() => featureIdentityOperation.id),
    role: text('role', { enum: ['input', 'output'] }).notNull(),
    featureId: text('featureId').notNull(),
    revisionId: text('revisionId').notNull(),
  },
  table => [
    unique('feature_identity_member').on(
      table.operationId,
      table.role,
      table.featureId,
    ),
    foreignKey({
      columns: [table.featureId, table.revisionId],
      foreignColumns: [featureRevision.featureId, featureRevision.id],
    }),
    check('feature_identity_member_role', sql`${table.role} IN ('input','output')`),
  ],
)
