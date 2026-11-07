// DRIZZLE
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
// SCHEMA
import { feature } from './feature'
import { task } from './task'
import { featureIdentityProposalDecision } from './featureIdentityProposal'
import { featureImageUploadRevision } from './featureImageUploadRevision'
import {
  featureRevision,
  featureRevisionProposal,
  revisionChangeSet,
} from './featureRevision'

/** Immutable reassignment evidence; the accepted identity decision supplies operation lineage. */
export const featureTaskTransfer = sqliteTable(
  'featureTaskTransfer',
  {
    id: text('id').primaryKey(),
    identityProposalId: text('identityProposalId')
      .notNull()
      .references(() => featureIdentityProposalDecision.proposalId),
    taskId: text('taskId')
      .notNull()
      .references(() => task.id),
    sequence: integer('sequence').notNull(),
    sourceFeatureId: text('sourceFeatureId')
      .notNull()
      .references(() => feature.id),
    targetFeatureId: text('targetFeatureId')
      .notNull()
      .references(() => feature.id),
    sourceModifiedAt: text('sourceModifiedAt').notNull(),
    changeSetId: text('changeSetId')
      .notNull()
      .references(() => revisionChangeSet.id),
  },
  table => [
    uniqueIndex('feature_task_transfer_sequence').on(table.taskId, table.sequence),
  ],
)

/** Links a forwarded proposal to its original upload and the exact proposal it replaced. */
export const featureTaskUploadTransfer = sqliteTable(
  'featureTaskUploadTransfer',
  {
    transferId: text('transferId')
      .notNull()
      .references(() => featureTaskTransfer.id),
    uploadId: text('uploadId')
      .notNull()
      .references(() => featureImageUploadRevision.id),
    sourceProposalId: text('sourceProposalId')
      .notNull()
      .references(() => featureRevisionProposal.id),
    sourceCandidateRevisionId: text('sourceCandidateRevisionId')
      .notNull()
      .references(() => featureRevision.id),
    proposalId: text('proposalId')
      .notNull()
      .references(() => featureRevisionProposal.id),
  },
  table => [primaryKey({ columns: [table.transferId, table.uploadId] })],
)
