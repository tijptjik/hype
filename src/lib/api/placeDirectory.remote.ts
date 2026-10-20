// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// REMOTE
import { guardedQuery } from '#lib/api/server/guarded.js'
// AUTHORIZATION
import { authorizeProjectUpdateForSubmission } from '#lib/api/services/authz/index.js'
// DB
import { probeProjectQuery } from '#lib/db/services/project.js'
import { probePlaceIdentityScope } from '#lib/db/services/placeIdentityReview.js'
import { listPlaceResources } from '#lib/db/services/placeDirectory.js'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'

/**
 * Authorize private catalogue access using current persisted Project ancestry.
 * @param ctx Current request account and roles.
 * @param projectId Optional private owner; omission allows only shared Places.
 * @returns Nothing when authorized.
 * @remarks Public Feature visibility never grants access to private Place baselines.
 */
async function requireDirectoryAccess(
  ctx: GuardedBaseContext,
  projectId?: string,
): Promise<void> {
  if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
  if (!projectId) return
  const resource = await probeProjectQuery(ctx.db, { ref: projectId, refKey: 'id' })
  if (!resource) error(404, 'PROJECT_NOT_FOUND')
  const decision = authorizeProjectUpdateForSubmission({
    user: ctx.user,
    userRoles: ctx.userRoles,
    resource,
    submittedData: { placeUpdatePolicy: true },
  })
  if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
}

/**
 * Browse shared Places and optionally one manageable Project's private Places.
 * @param input Literal search, authorized owner scope and stable ID cursor.
 * @returns A bounded page without source payloads or associated Features.
 */
export const getPlaces = guardedQuery(
  z.strictObject({
    scope: z.string().max(4000).optional(),
    projectId: z.string().min(1).max(200).optional(),
    q: z.string().trim().max(200).optional(),
    after: z.string().min(1).max(200).optional(),
  }),
  async (input, ctx) => {
    await requireDirectoryAccess(ctx, input.projectId)
    return listPlaceResources(ctx.db, input)
  },
)

/**
 * Read a Place by its permanent HYPE ID, independently of a Feature.
 * @param input Stable Place identity.
 * @returns Latest retained facts, or null if missing or moved out of the authorized scope.
 * @remarks Redirects remain explicit; this does not follow or accept another identity.
 */
export const getPlace = guardedQuery(
  z.strictObject({
    id: z.string().min(1).max(200),
    scope: z.string().max(4000).optional(),
  }),
  async (input, ctx) => {
    await requireDirectoryAccess(ctx)
    const scope = await probePlaceIdentityScope(ctx.db, input.id)
    if (!scope) return null
    await requireDirectoryAccess(ctx, scope.ownerProjectId ?? undefined)
    const result = await listPlaceResources(ctx.db, {
      id: input.id,
      projectId: scope.ownerProjectId ?? undefined,
    })
    return result.data[0] ?? null
  },
)
