// DRIZZLE
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { feature } from './feature'
import { featureIdentityOperation, revisionChangeSet } from './featureRevision'

/** Immutable multi-identity proposal; its plan pins complete input/output revision references. */
export const featureIdentityProposal = sqliteTable('featureIdentityProposal', {
  id: text('id').primaryKey(), actorId: text('actorId').notNull(), kind: text('kind', { enum: ['merge','split'] }).notNull(),
  plan: text('plan', { mode: 'json' }).notNull(), changeSetId: text('changeSetId').notNull().references(() => revisionChangeSet.id),
})
/** One immutable review decision, linked to the accepted lineage operation when published. */
export const featureIdentityProposalDecision = sqliteTable('featureIdentityProposalDecision', {
  proposalId: text('proposalId').primaryKey().references(() => featureIdentityProposal.id),
  outcome: text('outcome', { enum: ['accepted','rejected'] }).notNull(),
  operationId: text('operationId').references(() => featureIdentityOperation.id),
  changeSetId: text('changeSetId').notNull().references(() => revisionChangeSet.id),
})
/** A private child cannot bypass the identity operation through ordinary staff publication. */
export const featureIdentityReservation = sqliteTable('featureIdentityReservation', {
  featureId: text('featureId').primaryKey().references(() => feature.id),
  proposalId: text('proposalId').notNull().references(() => featureIdentityProposal.id),
})
