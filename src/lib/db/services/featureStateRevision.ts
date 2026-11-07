// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
// SERVICES
import { hasFeatureLifecycleStorage, prepareLifecycleCapture } from './featureLifecycle'
import { routeFeatureRevisionPublication } from './featureRevisionPublication'
import { hasFeatureRevisionHead } from './featureImageUploadRevision'
import { prepareFeatureAcceptedCapture } from './featureAcceptedCapture'
import { executeRevisionBatch } from './revisionBatch'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { FeatureDB, FeatureDBPartial } from '#lib/db/zod/schema/feature.types.js'

/**
 * Records explicitly authorized status commands without bypassing Feature content history.
 * @param db Request database.
 * @param input Current identity/timestamp, scoped actor and validated status patch.
 * @returns Legacy routing or the atomically updated enrolled Feature; undefined means stale.
 * @remarks Content-bearing geometry/text edits use the regular form. Publication exposes accepted content. Identity-only controls remain live; reviewed missing-report withdrawal is recorded here.
 */
export async function updateFeatureRevisionState(db: Database, input: {
  featureId: string; updatedAt: string; data: FeatureDBPartial; actorId: string; guard: SQL
}): Promise<{ status: 'legacy' } | { status: 'updated'; feature: FeatureDB | undefined }> {
  const allowed = new Set(['isIntangible','isVisitable','isPendingReview','isArchived','isPublished'])
  if (Object.keys(input.data).some(key => !allowed.has(key))) throw new Error('Feature content changes require the regular editor')
  if (await hasFeatureLifecycleStorage(db)) {
    const guard=sql`(${input.guard}) AND EXISTS(SELECT 1 FROM feature WHERE id=${input.featureId} AND modifiedAt=${input.updatedAt})`
    if (!await db.get(sql`SELECT 1 WHERE ${guard}`)) return {status:'updated',feature:undefined}
    const capture=await prepareLifecycleCapture(db,{...input,guard,visibility:input.data.isPublished??undefined,derive:content=>{
      if(input.data.isIntangible!==undefined)content.profile.isIntangible=Boolean(input.data.isIntangible)
      if(input.data.isVisitable!==undefined)content.profile.visitability.isVisitable=Boolean(input.data.isVisitable)
      return content
    }})
    const modifiedAt=new Date(Math.max(Date.now(),(Date.parse(input.updatedAt)||0)+1)).toISOString()
    const result=await executeRevisionBatch(db,guard,[...capture.before,
      db.update(feature).set({...input.data,modifiedAt,
        ...(input.data.isPublished===undefined?{}:{localIsPublished:input.data.isPublished})}).where(eq(feature.id,input.featureId)),
      ...capture.after,db.select().from(feature).where(eq(feature.id,input.featureId))])
    return {status:'updated',feature:result?(result.at(-1) as FeatureDB[])[0]:undefined}
  }
  if (!await hasFeatureRevisionHead(db, input.featureId)) return { status: 'legacy' }
  const guard = and(input.guard, sql`EXISTS (SELECT 1 FROM featureRevisionHead WHERE featureId=${input.featureId} AND state='active')`, sql`EXISTS (SELECT 1 FROM feature WHERE id=${input.featureId} AND modifiedAt=${input.updatedAt})`)!
  // Stale commands return the ordinary concurrency result before reading accepted content.
  if (!await db.get(sql`SELECT 1 AS eligible WHERE ${guard}`)) return { status: 'updated', feature: undefined }
  if (input.data.isPublished === true) {
    if (Object.keys(input.data).length !== 1) throw new Error('Save content changes before changing publication')
    const result = await routeFeatureRevisionPublication(db,{...input,guard,state:true})
    return {status:'updated',feature:result==='updated' ? await db.select().from(feature).where(eq(feature.id,input.featureId)).get() as FeatureDB : undefined}
  }
  const authored = input.data.isIntangible !== undefined || input.data.isVisitable !== undefined || input.data.isPublished === false
  const capture = authored ? await prepareFeatureAcceptedCapture(db, {
    ...input, guard, reason: 'Feature status updated', unpublish: input.data.isPublished === false,
    derive: previous => {
      const content = structuredClone(previous)
      if (input.data.isIntangible !== undefined) content.profile.isIntangible = Boolean(input.data.isIntangible)
      if (input.data.isVisitable !== undefined) content.profile.visitability.isVisitable = Boolean(input.data.isVisitable)
      return content
    },
  }) : { before: [], after: [] }
  const modifiedAt = new Date(Math.max(Date.now(), (Date.parse(input.updatedAt) || 0) + 1)).toISOString()
  const results = await executeRevisionBatch(db, guard, [
    ...capture.before, db.update(feature).set({ ...input.data, modifiedAt }).where(eq(feature.id, input.featureId)),
    ...capture.after, db.select().from(feature).where(eq(feature.id, input.featureId)),
  ])
  return { status: 'updated', feature: results ? (results.at(-1) as FeatureDB[])[0] : undefined }
}
