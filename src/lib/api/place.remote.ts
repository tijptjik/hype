// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// REMOTE
import { guardedCommand, guardedQuery } from '#lib/api/server/guarded.js'
// AUTHORIZATION
import {
  authorizeProjectUpdateForSubmission,
  authorizeFeatureReadForProbe,
} from '#lib/api/services/authz/index.js'
// DB
import { probeProjectQuery } from '#lib/db/services/project.js'
import { probeFeatureQuery } from '#lib/db/services/feature.js'
import {
  getAcceptedFeaturePlace,
  getProjectPlaceSettings,
  saveProjectPlaceSettings,
} from '#lib/db/services/place.js'
import { createLocalPlace as persistLocalPlace } from '#lib/db/services/placeLocal.js'
import { LocalPlaceInputSchema } from '#lib/places/local.js'
// DOMAIN
import { ProjectPlacePolicySchema } from '#lib/places/model.js'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. PROJECT SETTINGS AUTHORIZATION
// 2. POLICY READ / WRITE
// 3. ACCEPTED FEATURE PLACE READ
// 4. LOCAL PLACE CREATION
// ---

const projectInput = z.strictObject({ projectId: z.string().min(1) })

/**
 * Authorize settings management using persisted ancestry and project field policy.
 * @param ctx Authenticated request context.
 * @param projectId Project to probe before loading settings.
 * @returns Nothing when allowed; throws for missing or unauthorized projects.
 * @remarks Translators and unrelated project maintainers cannot change adoption policy.
 */
async function requireProjectPolicyManager(
  ctx: GuardedBaseContext,
  projectId: string,
): Promise<void> {
  const probe = await probeProjectQuery(ctx.db, { ref: projectId, refKey: 'id' })
  if (!probe) error(404, 'PROJECT_NOT_FOUND')
  const decision = authorizeProjectUpdateForSubmission({
    user: ctx.user,
    userRoles: ctx.userRoles,
    resource: probe,
    submittedData: { placeUpdatePolicy: true },
  })
  if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
}

/**
 * Read adoption settings for an authorized project manager.
 * @param input Project identity.
 * @returns Validated policy and its concurrency revision.
 */
export const getPlaceUpdatePolicy = guardedQuery(projectInput, async (input, ctx) => {
  await requireProjectPolicyManager(ctx, input.projectId)
  return getProjectPlaceSettings(ctx.db, input.projectId)
})

/**
 * Save project-specific adoption rules with optimistic concurrency.
 * @param input Project, complete policy and revision from the preceding read.
 * @returns Saved policy and incremented revision.
 * @remarks No existing Feature or pending/rejected source change is replayed.
 */
export const setPlaceUpdatePolicy = guardedCommand(
  projectInput.extend({
    policy: ProjectPlacePolicySchema,
    expectedRevision: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
  }),
  async (input, ctx) => {
    await requireProjectPolicyManager(ctx, input.projectId)
    const saved = await saveProjectPlaceSettings(
      ctx.db,
      input.projectId,
      input.policy,
      input.expectedRevision,
    )
    if (!saved) error(409, 'PLACE_POLICY_CHANGED')
    return saved
  },
)

/**
 * Read accepted Place values through the Feature's existing visibility permissions.
 * @param input Feature identity.
 * @returns Accepted Place projection, or null when unlinked or inaccessible by scope.
 * @remarks Does not expose raw snapshots or reveal other Features at the same Place.
 */
export const getFeaturePlace = guardedQuery(
  z.strictObject({ featureId: z.string().min(1) }),
  async (input, ctx) => {
    const probe = await probeFeatureQuery(ctx.db, {
      ref: input.featureId,
      refKey: 'id',
    })
    if (!probe) return null
    const decision = authorizeFeatureReadForProbe({
      user: ctx.user,
      userRoles: ctx.userRoles,
      probe,
    })
    if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
    return getAcceptedFeaturePlace(ctx.db, input.featureId, probe.projectId)
  },
)

/**
 * Create a private Place baseline in a project the caller manages.
 * @param input Owning project, intentional state and validated local facts.
 * @returns Stable HYPE identity and immutable initial revision.
 * @remarks No Feature or upstream SaanSeoi record is changed by creation.
 */
export const createLocalPlace = guardedCommand(
  projectInput.extend(LocalPlaceInputSchema.shape),
  async (input, ctx) => {
    await requireProjectPolicyManager(ctx, input.projectId)
    return persistLocalPlace(
      ctx.db,
      input.projectId,
      { state: input.state, facts: input.facts },
      ctx.user.id,
    )
  },
)
