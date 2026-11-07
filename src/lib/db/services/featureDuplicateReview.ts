// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import { partialFeatureProposal, partialFeatureReview } from '../schema/featureLifecycle.target'
import { task } from '../schema/task'
import { featureRevisionProposal, featureRevisionReview } from '../schema/featureRevision'
// SERVICES
import { prepareRevisionChangeSet } from './featureRevision'
import { prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { Database } from '#lib/types.js'
import type { BatchItem } from 'drizzle-orm/batch'

/** Prepares terminal contribution review evidence for the same batch as a duplicate merge.
 * @param db Request database.
 * @param input Authorized pending task and exact selected photos.
 * @returns Guarded photo/initial proposal decisions and task completion statements.
 * @remarks Images and task evidence keep their original owners; selected pins are adopted by the merge.
 */
export async function prepareFeatureDuplicateReview(db: Database, input: {
  taskId: string; featureId: string; actorId: string; imageIds: readonly string[]
}): Promise<BatchItem<'sqlite'>[]> {
  const initial = await db.get<{ proposalId: string; candidateRevisionId: string }>(sql`SELECT p.id proposalId,p.candidateRevisionId
    FROM featureInitialRevision i JOIN featureRevisionProposal p ON p.id=i.proposalId
    JOIN task t ON t.featureId=i.featureId AND t.contributorId=p.contributorId
    WHERE i.featureId=${input.featureId} AND i.mode='contribution' AND p.status='submitted'
      AND t.id=${input.taskId} AND t.type='newFeature' AND t.isDraft=0 AND t.isReviewed=0`)
  if (!initial) throw new Error('Contribution is no longer awaiting review')
  const uploads = await db.all<{ proposalId: string; candidateRevisionId: string; imageId: string; imageRevisionId: string }>(sql`
    SELECT u.proposalId,p.candidateRevisionId,u.imageId,u.imageRevisionId FROM featureImageUploadRevision u
    JOIN featureRevisionProposal p ON p.id=u.proposalId WHERE u.featureId=${input.featureId}
      AND EXISTS (SELECT 1 FROM json_each(u.taskIds) WHERE value=${input.taskId})`)
  const change = prepareRevisionChangeSet(db, {...input,reason:'Contribution merged with an existing Feature'})
  const statements: BatchItem<'sqlite'>[] = [change.statement]
  // A decision references exact frozen candidates, never a mutable upload or a merge timestamp.
  const items: { proposalId: string; candidateRevisionId: string; imageId?: string; imageRevisionId?: string }[] = [...uploads, initial]
  for (const item of items) {
    const selected = !item.imageId || input.imageIds.includes(item.imageId)
    statements.push(prepareRevisionCheck(db,sql`EXISTS (SELECT 1 FROM featureRevisionProposal
      WHERE id=${item.proposalId} AND featureId=${input.featureId} AND status='submitted' AND candidateRevisionId=${item.candidateRevisionId})`))
    if (item.imageId && item.imageRevisionId) statements.push(prepareRevisionCheck(db,sql`EXISTS (SELECT 1 FROM taskImage
      WHERE taskId=${input.taskId} AND imageId=${item.imageId}) AND EXISTS (SELECT 1 FROM featureRevisionImage
      WHERE featureRevisionId=${initial.candidateRevisionId} AND imageId=${item.imageId} AND imageRevisionId=${item.imageRevisionId})`))
    statements.push(db.update(featureRevisionProposal).set({status:selected?'accepted':'rejected'}).where(eq(featureRevisionProposal.id,item.proposalId)),
      db.insert(featureRevisionReview).values({id:crypto.randomUUID(),featureId:input.featureId,proposalId:item.proposalId,
        candidateRevisionId:item.candidateRevisionId,resultingRevisionId:selected?item.candidateRevisionId:null,
        action:selected?'accepted':'rejected',changeSetId:change.id}))
  }
  statements.push(db.update(task).set({isReviewed:true,reviewerId:input.actorId,reviewOutcome:'accepted',reviewAction:'merged-feature',
    reviewReason:'Duplicate merged with an existing Feature'}).where(sql`id=${input.taskId} AND featureId=${input.featureId} AND isReviewed=0 AND isDraft=0 AND type='newFeature'`),
    prepareRevisionCheck(db,sql`changes()=1`))
  return statements
}

/** Prepare a legacy creation task's review for the single-current-revision merge transaction.
 * @param db Request database. @param input Exact pending contribution task and scoped reviewer.
 * @returns A completion builder tied to the actual surviving revision's image pins.
 * @remarks Existing legacy identities keep their history. New creation proposals use duplicate adoption without identity lineage.
 */
export async function prepareLifecycleDuplicateReview(db:Database,input:{taskId:string;featureId:string;actorId:string}):Promise<(revisionId:string)=>BatchItem<'sqlite'>[]> {
  const initial=await db.get<{id:string;version:string;changes:string;modifiedAt:string}>(sql`
    SELECT p.id,p.version,p.changes,t.modifiedAt FROM task t JOIN featureRevisionProposal p ON p.id=t.proposalId AND p.featureId=t.featureId
    WHERE t.id=${input.taskId} AND t.featureId=${input.featureId} AND t.type='newFeature' AND t.isDraft=0 AND t.isReviewed=0
      AND p.status='submitted' AND p.contributorId=t.contributorId AND json_extract(p.creationScope,'$.legacyInitial.mode')='contribution'`)
  if(!initial)throw new Error('Contribution is no longer awaiting review')
  const uploads=await db.all<{id:string;version:string;changes:string;imageId:string;imageRevisionId:string}>(sql`
    SELECT p.id,p.version,p.changes,u.imageId,u.imageRevisionId FROM featureUploadEvidence u JOIN featureRevisionProposal p ON p.id=u.proposalId
    WHERE u.featureId=${input.featureId} AND p.status='submitted' AND EXISTS(SELECT 1 FROM json_each(u.taskIds) WHERE value=${input.taskId})`)
  if(new Set(uploads.map(row=>row.id)).size!==uploads.length)throw new Error('Review the grouped upload proposal before merging this contribution')
  const change=prepareRevisionChangeSet(db,{...input,reason:'Duplicate contribution reviewed into the existing Feature'})
  return revisionId=>{
    const statements:BatchItem<'sqlite'>[]=[change.statement,prepareRevisionCheck(db,sql`EXISTS(SELECT 1 FROM task WHERE id=${input.taskId}
      AND featureId=${input.featureId} AND proposalId=${initial.id} AND modifiedAt=${initial.modifiedAt} AND isReviewed=0 AND isDraft=0)`)]
    for(const item of [...uploads,initial]){
      const selected='imageId' in item?sql`EXISTS(SELECT 1 FROM featureRevisionImage WHERE featureRevisionId=${revisionId} AND imageId=${item.imageId} AND imageRevisionId=${item.imageRevisionId})`:sql`1`
      statements.push(prepareRevisionCheck(db,sql`EXISTS(SELECT 1 FROM featureRevisionProposal WHERE id=${item.id} AND version=${item.version} AND featureId=${input.featureId} AND status='submitted')`),
        db.update(partialFeatureProposal).set({status:sql`CASE WHEN ${selected} THEN 'accepted' ELSE 'rejected' END`}).where(eq(partialFeatureProposal.id,item.id)),
        db.insert(partialFeatureReview).values({id:crypto.randomUUID(),featureId:input.featureId,proposalId:item.id,proposalVersion:item.version,changes:item.changes,
          action:sql`CASE WHEN ${selected} THEN 'accepted' ELSE 'rejected' END`,resultingRevisionId:sql`CASE WHEN ${selected} THEN ${revisionId} ELSE NULL END`,changeSetId:change.id}))
    }
    statements.push(db.update(task).set({isReviewed:true,reviewerId:input.actorId,reviewOutcome:'accepted',reviewAction:'merged-feature',reviewReason:'Duplicate merged with an existing Feature'})
      .where(sql`id=${input.taskId} AND modifiedAt=${initial.modifiedAt} AND isReviewed=0 AND isDraft=0`),prepareRevisionCheck(db,sql`changes()=1`))
    return statements
  }
}
