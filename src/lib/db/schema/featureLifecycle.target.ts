// DRIZZLE
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Target-schema bindings used only by the staged lifecycle writer until the audited cutover. */
export const lifecycleFeature = sqliteTable('feature', {
  id: text('id').primaryKey(),
  currentRevisionId: text('currentRevisionId'),
  revisionVersion: integer('revisionVersion').notNull(),
  isPublished: integer('isPublished'),
  isArchived: integer('isArchived'),
  localIsPublished: integer('localIsPublished'),
  organisationId: text('organisationId'),
  projectId: text('projectId'),
  layerId: text('layerId'),
})
export const acceptedFeatureRevision = sqliteTable('featureRevision', {
  id: text('id').primaryKey(),
  featureId: text('featureId').notNull(),
  previousRevisionId: text('previousRevisionId'),
  changeSetId: text('changeSetId').notNull(),
  content: text('content').notNull(),
  recordState: text('recordState'),
  legacyEvidence: text('legacyEvidence'),
  baselineAttribution: text('baselineAttribution'),
  sequence: integer('sequence'),
})
export const partialFeatureProposal = sqliteTable('featureRevisionProposal', {
  id: text('id').primaryKey(),
  featureId: text('featureId'),
  baseRevisionId: text('baseRevisionId'),
  kind: text('kind').notNull(),
  version: text('version').notNull(),
  changes: text('changes').notNull(),
  creationScope: text('creationScope'),
  contributorId: text('contributorId').notNull(),
  status: text('status').notNull(),
  createdChangeSetId: text('createdChangeSetId').notNull(),
})
export const partialFeatureReview = sqliteTable('featureRevisionReview', {
  id: text('id').primaryKey(),
  featureId: text('featureId'),
  proposalId: text('proposalId').notNull(),
  proposalVersion: text('proposalVersion').notNull(),
  changes: text('changes').notNull(),
  comparedRevisionId: text('comparedRevisionId'),
  resultingRevisionId: text('resultingRevisionId'),
  context: text('context').notNull().default('{}'),
  resolutions: text('resolutions').notNull().default('[]'),
  action: text('action').notNull(),
  changeSetId: text('changeSetId').notNull(),
})
export const lifecycleWriteScope = sqliteTable('featureRevisionWriteScope', {
  featureId: text('featureId').primaryKey(),
  token: text('token').notNull(),
})

/** Proposal tasks can exist before an accepted Feature identity is created. */
export const lifecycleTask = sqliteTable('task', {
  id: text('id').primaryKey(),
  featureId: text('featureId'),
  proposalId: text('proposalId'),
  organisationId: text('organisationId').notNull(),
  projectId: text('projectId').notNull(),
  contributorId: text('contributorId').notNull(),
  reviewerId: text('reviewerId'),
  type: text('type').notNull(),
  isDraft: integer('isDraft').notNull(),
  isReviewed: integer('isReviewed').notNull(),
  reviewOutcome: text('reviewOutcome'),
  reviewAction: text('reviewAction'),
  reviewReason: text('reviewReason'),
  createdAt: text('createdAt').notNull(),
  modifiedAt: text('modifiedAt').notNull(),
})

/** Immutable upload proof references the proposal version rather than a candidate Feature snapshot. */
export const lifecycleUploadEvidence = sqliteTable('featureUploadEvidence', {
  id: text('id').primaryKey(),
  featureId: text('featureId'),
  proposalId: text('proposalId').notNull(),
  proposalVersion: text('proposalVersion').notNull(),
  imageId: text('imageId').notNull(),
  imageRevisionId: text('imageRevisionId').notNull(),
  assetVersionId: text('assetVersionId').notNull(),
  actorId: text('actorId').notNull(),
  taskIds: text('taskIds', { mode: 'json' }).$type<string[]>().notNull(),
})

/** Additive review-image storage on the compatibility revision-head schema. */
export const legacyImageReview = sqliteTable('featureRevisionReview', {
  id: text('id').primaryKey(),
  featureId: text('featureId').notNull(),
  proposalId: text('proposalId').notNull(),
  candidateRevisionId: text('candidateRevisionId').notNull(),
  comparedRevisionId: text('comparedRevisionId'),
  resultingRevisionId: text('resultingRevisionId'),
  action: text('action').notNull(),
  changeSetId: text('changeSetId').notNull(),
  context: text('context').notNull(),
  resolutions: text('resolutions', { mode: 'json' })
    .$type<readonly import('#lib/revisions/merge.js').RevisionResolution[]>()
    .notNull()
    .default([]),
})
