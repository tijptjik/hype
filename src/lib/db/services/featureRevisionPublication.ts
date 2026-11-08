// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SERVICES
import {
  hasFeatureLifecycleStorage,
  readCurrentFeatureRevision,
  saveFeatureEdit,
} from './featureLifecycle'
import { unpublishFeatureRevision, prepareRevisionChangeSet } from './featureRevision'
import { readFeatureRevisionWorkspace } from './featureRevisionWorkspace'
import { featureContentProjectionMatches } from './featureRevisionProjection'
import { prepareFeatureRevisionWriteScope } from './featureRevisionWriteScope'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
// SCHEMA
import { feature } from '../schema/feature'
import { featureImage } from '../schema/image'
import { privateFeatureComparison } from './featurePrivateCapture'
import {
  featureRevisionHead,
  featureRevisionPublication,
} from '../schema/featureRevision'
// DOMAIN
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'

/**
 * Fences a legacy publication transaction against concurrent revision enrollment.
 * @param db Request database.
 * @param featureId Identity already routed to the legacy publication path.
 * @returns Predicate to evaluate inside the same batch as the legacy mutation.
 * @remarks Reading the absence of a head before the write is insufficient: enrollment
 * may finish during authorization or image-policy preparation.
 */
export async function featureLegacyPublicationGuard(
  db: Database,
  featureId: string,
): Promise<SQL> {
  if (await hasFeatureLifecycleStorage(db)) return sql`0`
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='featureRevisionHead'`,
  )
  return storage?.n
    ? sql`NOT EXISTS (SELECT 1 FROM featureRevisionHead WHERE featureId=${featureId})`
    : sql`1`
}

/**
 * Routes ordinary publication controls through the revision head for enrolled identities.
 * @param db Request database.
 * @param input Currently authorized Feature, actor and requested visibility.
 * @returns Legacy routing, successful visibility change/no-op, or stale evidence.
 * @remarks Publishing exposes only the current accepted content. Pending proposals are never selected. Unpublication retains content and media history.
 */
export async function routeFeatureRevisionPublication(
  db: Database,
  input: { featureId: string; actorId: string; state: boolean; guard: SQL },
): Promise<'legacy' | 'updated' | 'stale'> {
  if (await hasFeatureLifecycleStorage(db)) {
    const current = await readCurrentFeatureRevision(db, input)
    if (!current) return 'stale'
    if (current.retired) throw new Error('Retired Features cannot be published')
    if (input.state && current.state.isArchived)
      throw new Error('Restore this Feature before publishing')
    if (current.state.isPublished === input.state) return 'updated'
    return (await saveFeatureEdit(db, {
      ...input,
      expectedRevisionId: current.revisionId,
      expectedVersion: current.version,
      state: { isPublished: input.state },
      derive: content => content,
      validate: () => [],
      reason: input.state ? 'Feature published' : 'Feature unpublished',
    }))
      ? 'updated'
      : 'stale'
  }
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) AS n FROM sqlite_master WHERE name='featureRevisionHead'`,
  )
  if (!storage?.n) return 'legacy'
  const head = await db.get<{
    publishedRevisionId: string | null
    generation: number
    state: string
  }>(sql`
    SELECT publishedRevisionId,generation,state FROM featureRevisionHead WHERE featureId=${input.featureId}`)
  if (!head) return 'legacy'
  if (head.state !== 'active') throw new Error('Retired Features cannot be published')
  if (input.state) {
    if (head.publishedRevisionId)
      return (await db.get(
        sql`SELECT 1 FROM feature WHERE id=${input.featureId} AND isPublished=1 AND (${input.guard})`,
      ))
        ? 'updated'
        : 'stale'
    const workspace = await readFeatureRevisionWorkspace(db, {
      ...input,
      canPublish: true,
    })
    if (workspace.initialContribution)
      throw new Error('Review this contribution in the task queue before publishing')
    const revisionId = workspace.comparisonRevisionId
    if (!revisionId) throw new Error('Accepted Feature content is unavailable')
    const row = await db.get<{ content: string }>(
      sql`SELECT content FROM featureRevision WHERE id=${revisionId} AND featureId=${input.featureId}`,
    )
    if (!row) return 'stale'
    const content = FeatureRevisionContentSchema.parse(JSON.parse(row.content))
    const change = prepareRevisionChangeSet(db, {
      ...input,
      reason: 'Feature published',
    })
    const privateComparison = await privateFeatureComparison(
      db,
      sql`${input.featureId}`,
      sql`${head.generation}`,
    )
    const privateToken = await db.get<{ id: string | null }>(
      sql`SELECT ${privateComparison} id`,
    )
    const scope = await prepareFeatureRevisionWriteScope(db, input.featureId)
    // Visibility exposes the accepted projection without selecting or applying pending proposals.
    const result = await executeRevisionBatch(db, input.guard, [
      prepareRevisionCheck(
        db,
        sql`(${featureContentProjectionMatches(input.featureId, content)}) AND ${privateComparison} IS ${privateToken?.id ?? null}
        AND EXISTS (SELECT 1 FROM featureRevisionHead WHERE featureId=${input.featureId} AND state='active'
          AND publishedRevisionId IS NULL AND generation=${head.generation})
        AND EXISTS (SELECT 1 FROM feature WHERE id=${input.featureId} AND isArchived=0)`,
      ),
      ...scope.before,
      change.statement,
      db
        .update(featureRevisionHead)
        .set({ publishedRevisionId: revisionId, generation: head.generation + 1 })
        .where(eq(featureRevisionHead.featureId, input.featureId)),
      db
        .update(feature)
        .set({
          isPublished: true,
          localIsPublished: true,
          isDraft: false,
          publisherId: input.actorId,
          publishedAt: new Date().toISOString(),
        })
        .where(eq(feature.id, input.featureId)),
      db
        .update(featureImage)
        .set({
          isPublished: sql`COALESCE(localIsPublished,isPublished) AND EXISTS (SELECT 1 FROM image i WHERE i.id=featureImage.imageId AND i.isArchived=0)`,
        })
        .where(eq(featureImage.featureId, input.featureId)),
      db.insert(featureRevisionPublication).values({
        id: crypto.randomUUID(),
        featureId: input.featureId,
        previousRevisionId: null,
        revisionId,
        generation: head.generation + 1,
        changeSetId: change.id,
      }),
      ...scope.after,
    ])
    return result ? 'updated' : 'stale'
  }
  if (!head.publishedRevisionId)
    return (await db.get(
      sql`SELECT 1 FROM feature WHERE id=${input.featureId} AND isPublished=0 AND (${input.guard})`,
    ))
      ? 'updated'
      : 'stale'
  return (await unpublishFeatureRevision(db, {
    ...input,
    reason: 'Feature unpublished',
    expectedPublishedRevisionId: head.publishedRevisionId,
    expectedGeneration: head.generation,
    projection: {
      statements: [],
      verify: sql`EXISTS (SELECT 1 FROM feature WHERE id=${input.featureId} AND isPublished=0 AND localIsPublished=0)`,
    },
  }))
    ? 'updated'
    : 'stale'
}
