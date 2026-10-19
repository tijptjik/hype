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
  authorizeFeatureUpdateForSubmission,
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
import { linkInitialFeaturePlace } from '#lib/db/services/placeLink.js'
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
// 5. INITIAL FEATURE ASSOCIATION
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

/**
 * Associate a Feature with an explicitly selected existing Place revision.
 * @param input Feature, selected Place/revision and the editor's Feature timestamp.
 * @returns New association token after preserving persisted effective values.
 * @remarks Authorizes all inheritable field groups against persisted ancestry. Source
 * identities, overrides, project scope and baseline facts cannot be supplied by the client.
 */
export const linkFeaturePlace = guardedCommand(
  z.strictObject({
    featureId: z.string().min(1),
    placeId: z.string().min(1),
    revisionId: z.string().min(1),
    expectedFeatureModifiedAt: z.string().min(1),
  }),
  async (input, ctx) => {
    const probe = await probeFeatureQuery(ctx.db, {
      ref: input.featureId,
      refKey: 'id',
    })
    if (!probe) error(404, 'FEATURE_NOT_FOUND')
    const decision = authorizeFeatureUpdateForSubmission({
      user: ctx.user,
      userRoles: ctx.userRoles,
      resource: probe,
      submittedData: {
        i18n: true,
        properties: true,
        geometry: true,
        addressMeta: true,
      },
    })
    if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
    const result = await linkInitialFeaturePlace(ctx.db, {
      ...input,
      projectId: probe.projectId,
      actorId: ctx.user.id,
    })
    if (result.status === 'conflict') error(409, 'PLACE_LINK_CHANGED')
    if (result.status === 'place-unavailable') error(404, 'PLACE_NOT_FOUND')
    if (result.status !== 'linked') error(422, 'PLACE_LINK_REVIEW_REQUIRED')
    return result
  },
)
