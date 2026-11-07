// DRIZZLE
import { sql } from 'drizzle-orm'
import { check, foreignKey, index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { featureRevision, featureRevisionProposal } from './featureRevision'
import { imageAssetVersion, imageRevision } from './imageRevision'

/** Immutable upload receipt and proposal-scoped attachment authority; never a public membership. */
export const featureImageUploadRevision = sqliteTable(
  'featureImageUploadRevision',
  {
    id: text('id').primaryKey(),
    featureId: text('featureId').notNull(),
    proposalId: text('proposalId').notNull(),
    candidateRevisionId: text('candidateRevisionId').notNull(),
    imageId: text('imageId').notNull(),
    imageRevisionId: text('imageRevisionId').notNull(),
    assetVersionId: text('assetVersionId').notNull().unique(),
    actorId: text('actorId').notNull(),
    taskIds: text('taskIds', { mode: 'json' }).$type<string[]>().notNull(),
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
      columns: [table.imageId, table.imageRevisionId],
      foreignColumns: [imageRevision.imageId, imageRevision.id],
    }),
    foreignKey({
      columns: [table.imageId, table.assetVersionId],
      foreignColumns: [imageAssetVersion.imageId, imageAssetVersion.id],
    }),
    index('feature_image_upload_proposal').on(table.featureId, table.proposalId),
    check(
      'feature_image_upload_task_ids',
      sql`json_valid(${table.taskIds}) AND json_type(${table.taskIds})='array'`,
    ),
  ],
)
