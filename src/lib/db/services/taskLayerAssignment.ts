// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
import { featureRevision } from '../schema/featureRevision'
import { legacyImageReview } from '../schema/featureLifecycle.target'
// SERVICES
import { hasFeatureLifecycleStorage } from './featureLifecycle'
import { prepareRevisionChangeSet } from './revisionChangeSet'
import { prepareFeatureRevisionWriteScope } from './featureRevisionWriteScope'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
// DOMAIN
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
// TYPES
import type { Database } from '#lib/types.js'

/** Record a reviewer's historical assignment without editing the frozen submission.
 * @param db Request database.
 * @param input Authorized pending task, destination and inspected Feature token.
 * @returns Null for the legacy path, otherwise whether the guarded assignment committed.
 * @remarks The submitted candidate remains immutable. An attributed review snapshot records
 * the status override, which initial acceptance must compose with the submitted content.
 */
export async function assignInitialTaskHistoricalLayer(
  db: Database,
  input: {
    taskId: string
    featureId: string
    layerId: string
    projectId: string
    organisationId: string
    updatedAt: string
    actorId: string
  },
): Promise<boolean | null> {
  if (await hasFeatureLifecycleStorage(db)) return null
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE name='featureInitialRevision'`,
  )
  if (!storage?.n) return null
  const initial = await db.get<{
    proposalId: string
    candidateRevisionId: string
    content: string
  }>(sql`
    SELECT p.id proposalId,p.candidateRevisionId,r.content FROM featureInitialRevision i
    JOIN featureRevisionProposal p ON p.id=i.proposalId AND p.featureId=i.featureId
    JOIN featureRevision r ON r.id=p.candidateRevisionId AND r.featureId=i.featureId
    WHERE i.featureId=${input.featureId} AND i.mode='contribution'`)
  if (!initial) return null
  const guard = sql`EXISTS(SELECT 1 FROM task t JOIN feature f ON f.id=t.featureId
    JOIN featureRevisionHead h ON h.featureId=f.id JOIN featureRevisionProposal p ON p.id=${initial.proposalId}
    JOIN layer l ON l.id=${input.layerId} JOIN project project ON project.id=l.projectId
    WHERE t.id=${input.taskId} AND t.type='newFeature' AND t.isDraft=0 AND t.isReviewed=0
      AND f.id=${input.featureId} AND f.modifiedAt=${input.updatedAt} AND f.isPublished=0 AND f.isArchived=0
      AND t.projectId=${input.projectId} AND f.projectId=t.projectId AND l.projectId=t.projectId
      AND t.organisationId=${input.organisationId} AND f.organisationId=t.organisationId AND l.organisationId=t.organisationId
      AND l.historicalSourceLayerId IS NOT NULL AND json_extract(project.flags,'$.showHistoricalLayers')=1
      AND h.state='active' AND h.generation=0 AND h.publishedRevisionId IS NULL
      AND p.featureId=f.id AND p.status='submitted' AND p.candidateRevisionId=${initial.candidateRevisionId}
      AND p.contributorId=t.contributorId)`
  const content = FeatureRevisionContentSchema.parse(JSON.parse(initial.content))
  content.profile.isIntangible = true
  const revisionId = crypto.randomUUID()
  const change = prepareRevisionChangeSet(db, {
    actorId: input.actorId,
    reason: 'Contribution assigned to historical layer',
  })
  const scope = await prepareFeatureRevisionWriteScope(db, input.featureId)
  // Scope, immutable review evidence and the routed projection commit as one transaction.
  const result = await executeRevisionBatch(db, guard, [
    change.statement,
    db.insert(featureRevision).values({
      id: revisionId,
      featureId: input.featureId,
      previousRevisionId: initial.candidateRevisionId,
      changeSetId: change.id,
      content,
    }),
    db.insert(legacyImageReview).values({
      id: crypto.randomUUID(),
      featureId: input.featureId,
      proposalId: initial.proposalId,
      candidateRevisionId: initial.candidateRevisionId,
      comparedRevisionId: revisionId,
      action: 'saved',
      changeSetId: change.id,
      context: JSON.stringify({
        kind: 'task-layer-assignment/v1',
        taskId: input.taskId,
        layerId: input.layerId,
        isIntangible: true,
      }),
    }),
    ...scope.before,
    db
      .update(feature)
      .set({
        layerId: input.layerId,
        isIntangible: true,
        modifiedAt: new Date(
          Math.max(Date.now(), (Date.parse(input.updatedAt) || 0) + 1),
        ).toISOString(),
      })
      .where(eq(feature.id, input.featureId)),
    prepareRevisionCheck(
      db,
      sql`EXISTS(SELECT 1 FROM feature WHERE id=${input.featureId} AND layerId=${input.layerId} AND isIntangible=1)`,
    ),
    ...scope.after,
  ])
  return result !== null
}
