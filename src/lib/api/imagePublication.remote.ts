// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { sql } from 'drizzle-orm'
// REMOTE
import { guardedCommand, guardedQuery } from './server/guarded'
// AUTHORIZATION
import { authorizeFeaturePublishForSubmission, authorizeProjectPublishForSubmission, authorizeLayerPublishForSubmission, authorizeOrganisationPublishForSubmission } from './services/authz'
// DB
import { readImageIntentPolicy, prepareImageIntentGalleryChange } from '#lib/db/services/imageIntentPolicy.js'
import { executeRevisionBatch, prepareRevisionCheck } from '#lib/db/services/revisionBatch.js'
// TYPES
import type { GuardedBaseContext } from './guarded.types'
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'

const scopeSchema = z.strictObject({ type: z.enum(['feature', 'layer', 'project', 'organisation']), id: z.string().min(1) })
type Scope = z.infer<typeof scopeSchema>

/**
 * Authorizes publication against current ancestry and returns the exact retained scope.
 * @param ctx Request actor and database.
 * @param scope Feature or ancestor being published.
 * @returns A Feature query condition and write-time parent guard.
 */
async function authorizeScope(ctx: GuardedBaseContext, scope: Scope): Promise<{ condition: SQL; guard: SQL }> {
  const actor = { user: ctx.user, userRoles: ctx.userRoles }
  const missing = (): never => error(404, 'Publication resource is unavailable')
  if (scope.type === 'organisation') {
    const row = await ctx.db.get<{ id: string; hubId: string | null }>(sql`SELECT id,hubId FROM organisation WHERE id=${scope.id}`) ?? missing()
    const decision = authorizeOrganisationPublishForSubmission({ ...actor, resource: row })
    if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
    return { condition: sql`f.organisationId=${row.id}`, guard: sql`EXISTS(SELECT 1 FROM organisation WHERE id=${row.id} AND hubId IS ${row.hubId} AND isPublished=1 AND isArchived=0)` }
  }
  const relation = scope.type === 'project' ? sql`project r` : scope.type === 'layer' ? sql`layer r JOIN project p ON p.id=r.projectId` : sql`feature r JOIN project p ON p.id=r.projectId`
  const projectId = scope.type === 'project' ? sql`r.id` : sql`r.projectId`
  const organisationId = scope.type === 'project' ? sql`r.organisationId` : sql`p.organisationId`
  const row = await ctx.db.get<{ id: string; projectId: string; organisationId: string; hubId: string | null; layerId: string | null }>(sql`
    SELECT r.id,${projectId} projectId,${organisationId} organisationId,o.hubId,${scope.type === 'feature' ? sql`r.layerId` : sql`NULL`} layerId
    FROM ${relation} JOIN organisation o ON o.id=${organisationId} WHERE r.id=${scope.id}`) ?? missing()
  const decision = scope.type === 'project' ? authorizeProjectPublishForSubmission({ ...actor, resource: row })
    : scope.type === 'layer' ? authorizeLayerPublishForSubmission({ ...actor, resource: row })
    : authorizeFeaturePublishForSubmission({ ...actor, resource: { ...row, layerId: row.layerId!, resourceHubId: row.hubId } })
  if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
  const column = scope.type === 'feature' ? sql`f.id` : scope.type === 'layer' ? sql`f.layerId` : sql`f.projectId`
  return { condition: sql`${column}=${scope.id} AND f.projectId=${row.projectId} AND f.organisationId=${row.organisationId}`,
    guard: sql`EXISTS(SELECT 1 FROM ${relation} JOIN organisation o ON o.id=${organisationId}
      WHERE r.id=${scope.id} AND ${projectId}=${row.projectId} AND ${organisationId}=${row.organisationId}
        AND o.hubId IS ${row.hubId} AND r.isPublished=1 AND r.isArchived=0)` }
}

/**
 * Builds the exact set offered by the follow-up modal, excluding pending contributions.
 * @param ctx Authorized request context.
 * @param scope Published resource scope.
 * @returns Inspected rows, effective policies, display copy and a concurrency token.
 */
async function publicationPreview(ctx: GuardedBaseContext, scope: Scope) {
  const access = await authorizeScope(ctx, scope)
  const selection = sql`SELECT fi.featureId,fi.imageId,f.projectId FROM featureImage fi JOIN feature f ON f.id=fi.featureId
    JOIN image i ON i.id=fi.imageId WHERE (${access.condition}) AND f.isPublished=1 AND f.isArchived=0 AND i.isArchived=0 AND fi.intent='undefined'
    AND NOT EXISTS(SELECT 1 FROM taskImage ti JOIN task t ON t.id=ti.taskId WHERE ti.imageId=fi.imageId AND t.featureId=f.id AND t.isReviewed=0)
    ORDER BY fi.featureId,fi.imageId`
  const rows = await ctx.db.all<{ featureId: string; imageId: string; projectId: string }>(selection)
  const policies = new Map<string, Awaited<ReturnType<typeof readImageIntentPolicy>>>()
  for (const row of rows) if (!policies.has(row.projectId)) policies.set(row.projectId, await readImageIntentPolicy(ctx.db, { type: 'project', id: row.projectId }))
  const versions = [...policies].map(([id, policy]) => [id, policy.version, policy.hubVersion])
  const bytes = new TextEncoder().encode(JSON.stringify({ rows, versions }))
  const token = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
  const labels = [...new Set([...policies.values()].map(policy => policy.intents.find(intent => intent.id === 'general')!.label))]
  return { ...access, selection, rows, policies, token, count: rows.length, label: labels.length === 1 ? labels[0] : 'their Catch-All intent' }
}

/**
 * Previews unclassified photos after a Feature or ancestor publication succeeds.
 * @param scope Published scope.
 * @returns Count, current Catch-All label and an exact confirmation token.
 */
export const getUnclassifiedPublicationPreview = guardedQuery(scopeSchema, async (scope, ctx) => {
  const preview = await publicationPreview(ctx, scope)
  return { count: preview.count, label: preview.label, token: preview.token }
})

/**
 * Assigns the inspected unclassified photos to each Project's Catch-All role.
 * @param input Published scope and preview token approved in the modal.
 * @returns The number classified after atomic history and projection writes.
 * @remarks Private custom intents and pending contributions are never included.
 */
export const publishUnclassifiedImages = guardedCommand(z.strictObject({ scope: scopeSchema, token: z.string() }), async (input, ctx) => {
  const preview = await publicationPreview(ctx, input.scope)
  if (preview.token !== input.token) error(409, 'The gallery changed. Refresh the publication preview before continuing.')
  if (!preview.count) return { count: 0 }
  const guard = sql`(${preview.guard}) AND (${sql.join([...preview.policies.values()].map(policy => sql`(${policy.guard})`), sql` AND `) || sql`1`})`
  const statements: BatchItem<'sqlite'>[] = [prepareRevisionCheck(ctx.db, sql`
    (SELECT json_group_array(json_object('featureId',featureId,'imageId',imageId,'projectId',projectId)) FROM (${preview.selection}))=${JSON.stringify(preview.rows)}`)]
  const features = new Map(preview.rows.map(row => [row.featureId, row.projectId]))
  for (const [featureId, projectId] of features) statements.push(...await prepareImageIntentGalleryChange(ctx.db, {
    featureId, actorId: ctx.user.id, guard: preview.guard, policy: preview.policies.get(projectId)!, classify: true, imageIds: preview.rows.filter(row => row.featureId === featureId).map(row => row.imageId),
  }))
  if (!await executeRevisionBatch(ctx.db, guard, statements)) error(409, 'The gallery changed. Refresh before publishing these images.')
  return { count: preview.count }
})
