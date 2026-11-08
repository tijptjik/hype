// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { sql } from 'drizzle-orm'
// REMOTE
import { guardedCommand, guardedQuery } from './server/guarded'
// AUTHORIZATION
import {
  authorizeHubUpdateForSubmission,
  authorizeProjectUpdateForSubmission,
} from './services/authz'
// DOMAIN
import { ImageIntentCatalogueSchema, ImageIntentIdSchema } from '#lib/images/intents.js'
// DB
import {
  readImageIntentPolicy,
  saveImageIntentPolicy,
} from '#lib/db/services/imageIntentPolicy.js'
// TYPES
import type { GuardedBaseContext } from './guarded.types'
import type { ImageIntentScope } from '#lib/db/services/imageIntentPolicy.js'
import type { SQL } from 'drizzle-orm'

const scopeSchema = z.strictObject({
  type: z.enum(['hub', 'project']),
  id: z.string().min(1),
})

/**
 * Authorizes settings against persisted ownership, retaining the probed ancestry in writes.
 * @param ctx Authenticated request context.
 * @param scope Requested settings owner.
 * @returns Transactional existence/ancestry guard.
 */
async function authorizeSettings(
  ctx: GuardedBaseContext,
  scope: ImageIntentScope,
): Promise<SQL> {
  if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
  if (scope.type === 'hub') {
    const row = await ctx.db.get<{ id: string }>(
      sql`SELECT id FROM hub WHERE id=${scope.id}`,
    )
    if (!row) error(404, 'HUB_NOT_FOUND')
    const decision = authorizeHubUpdateForSubmission({
      user: ctx.user,
      userRoles: ctx.userRoles,
      resource: row,
      submittedData: { i18n: true },
    })
    if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
    return sql`EXISTS(SELECT 1 FROM hub WHERE id=${scope.id})`
  }
  const row = await ctx.db.get<{
    id: string
    organisationId: string
    hubId: string | null
  }>(sql`
    SELECT p.id,p.organisationId,o.hubId FROM project p JOIN organisation o ON o.id=p.organisationId WHERE p.id=${scope.id}`)
  if (!row) error(404, 'PROJECT_NOT_FOUND')
  const decision = authorizeProjectUpdateForSubmission({
    user: ctx.user,
    userRoles: ctx.userRoles,
    resource: row,
    submittedData: { flags: true },
  })
  if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
  return sql`EXISTS(SELECT 1 FROM project p JOIN organisation o ON o.id=p.organisationId
    WHERE p.id=${row.id} AND p.organisationId=${row.organisationId} AND o.hubId IS ${row.hubId})`
}

/**
 * Reads the effective catalogue, inheritance and assignment counts for an authorized settings editor.
 * @param scope Hub or Project identity.
 * @returns Editable policy and current usage counts; no personal image metadata is returned.
 */
export const getImageIntentSettings = guardedQuery(scopeSchema, async (scope, ctx) => {
  await authorizeSettings(ctx, scope)
  const { guard: _guard, ...policy } = await readImageIntentPolicy(ctx.db, scope)
  const condition =
    scope.type === 'project'
      ? sql`p.id=${scope.id}`
      : sql`
    COALESCE(o.hubId,(SELECT id FROM hub WHERE code='core'))=${scope.id}
    AND NOT EXISTS(SELECT 1 FROM projectImageIntentPolicy ip WHERE ip.projectId=p.id AND ip.intents IS NOT NULL)`
  const rows = await ctx.db.all<{
    intent: string
    count: number
  }>(sql`SELECT fi.intent,count(*) count
    FROM featureImage fi JOIN feature f ON f.id=fi.featureId JOIN project p ON p.id=f.projectId
    JOIN organisation o ON o.id=p.organisationId WHERE ${condition} GROUP BY fi.intent`)
  const hubPolicy = policy.hubId
    ? await readImageIntentPolicy(ctx.db, { type: 'hub', id: policy.hubId })
    : policy
  return {
    ...policy,
    hubIntents: hubPolicy.intents,
    usage: Object.fromEntries(rows.map(row => [row.intent, row.count])),
  }
})

/**
 * Saves catalogue edits, inheritance, automatic classification and image reassignment as one operation.
 * @param input Inspected catalogue versions and explicit replacement decisions.
 * @returns Success after all affected accepted gallery revisions commit.
 * @remarks Stale settings or concurrent gallery edits abort the complete operation.
 */
export const updateImageIntentSettings = guardedCommand(
  z.strictObject({
    scope: scopeSchema,
    version: z.number().int(),
    hubVersion: z.number().int(),
    intents: ImageIntentCatalogueSchema.nullable(),
    autoPublishUnclassified: z.boolean(),
    reassignments: z.record(ImageIntentIdSchema, ImageIntentIdSchema),
  }),
  async (input, ctx) => {
    const guard = await authorizeSettings(ctx, input.scope)
    const saved = await saveImageIntentPolicy(ctx.db, {
      ...input,
      actorId: ctx.user.id,
      guard,
    })
    if (!saved)
      error(409, 'Image settings or galleries changed. Refresh before saving again.')
    return { saved: true }
  },
)
