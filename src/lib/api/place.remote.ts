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
import { rejectedFeaturePlaceSourceIds } from '#lib/db/services/placeIdentityRejection.js'
import { probeProjectQuery } from '#lib/db/services/project.js'
import { probeFeatureQuery } from '#lib/db/services/feature.js'
import {
  getAcceptedFeaturePlace,
  getProjectPlaceSettings,
  saveProjectPlaceSettings,
} from '#lib/db/services/place.js'
import { unlinkFeaturePlace as persistFeatureUnlink } from '#lib/db/services/placeUnlink.js'
import { getDetachedFeatureBrands } from '#lib/db/services/placeDetached.js'
import { createLocalPlace as persistLocalPlace } from '#lib/db/services/placeLocal.js'
import { linkInitialFeaturePlace } from '#lib/db/services/placeLink.js'
import { relinkFeaturePlace as persistFeatureRelink } from '#lib/db/services/placeRelink.js'
import {
  resolvePlaceCandidate,
  persistPlaceCandidate,
  searchLocalPlaceCandidates,
} from '#lib/db/services/placeCandidate.js'
import { LocalPlaceInputSchema } from '#lib/places/local.js'
// DOMAIN
import { ProjectPlacePolicySchema } from '#lib/places/model.js'
import {
  PlaceSearchInputSchema,
  searchSaanSeoiPlaces,
} from '#lib/places/sourceClient.js'
import { discoverPlacePublication } from '#lib/places/publication.js'
import { findSaanSeoiPlace } from '#lib/places/sourceLookup.js'
import { placeSourceEndpoint } from '#lib/places/sourceEndpoint.server.js'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. PROJECT SETTINGS AUTHORIZATION
// 2. POLICY READ / WRITE
// 3. ACCEPTED FEATURE PLACE AND DETACHED BRAND READS
// 4. LOCAL PLACE CREATION
// 5. INITIAL FEATURE ASSOCIATION
// 6. SOURCE DISCOVERY
// 7. CANDIDATE RESOLUTION
// 8. PRIVATE LOCAL DISCOVERY
// 9. EXPLICIT REASSOCIATION
// 10. EXPLICIT UNLINK
// 11. CANONICAL CANDIDATE IMPORT
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
 * Read preserved Feature-owned brands through normal Feature visibility checks.
 * @param input Feature identity.
 * @returns Detached brands and editor revision, or null when unavailable.
 * @remarks Authorization precedes the projection read; no source payload is returned.
 */
export const getFeatureDetachedBrands = guardedQuery(
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
    return getDetachedFeatureBrands(ctx.db, input.featureId, probe.projectId)
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

/**
 * Search upstream Places for an editor allowed to associate the selected Feature.
 * @param input Feature identity and bounded discovery query; no client source URL or key.
 * @returns Latest-source candidates, explicitly distinguished from linkable revisions.
 * @remarks Authorization precedes external requests. Discovery neither writes source
 * records nor links Features, and upstream errors never masquerade as empty results.
 * `id:<canonical ID>` and canonical ss-UUIDs use a pinned exact lookup, never name search.
 */
export const searchFeaturePlaces = guardedQuery(
  PlaceSearchInputSchema.extend({ featureId: z.string().min(1) }),
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
    const env = ctx.event.locals.platform?.env
    const apiKey = env?.SAANSEOI_API_KEY ?? env?.VITE_SAANSEOI_API_KEY
    if (!apiKey?.trim()) error(503, 'PLACE_SEARCH_UNAVAILABLE')
    try {
      const client = { ...placeSourceEndpoint(apiKey), fetch: ctx.event.fetch }
      const rejected = await rejectedFeaturePlaceSourceIds(
        ctx.db,
        input.featureId,
        probe.projectId,
      )
      // Exact IDs from migration evidence bypass the name-only discovery index.
      const exactId = input.q.startsWith('id:')
        ? input.q.slice(3).trim()
        : /^ss-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              input.q,
            )
          ? input.q
          : null
      if (exactId !== null) {
        const publication = await discoverPlacePublication(client)
        const found = await findSaanSeoiPlace(client, publication.pin, exactId)
        const locale = input.locale ?? 'en'
        const projection = found?.projection
        return {
          source: 'saanseoi-latest' as const,
          candidates: projection
            ? [
                {
                  placeId: projection.ssId,
                  previouslyRejected: rejected.has(projection.ssId),
                  resourceReleaseId: projection.releaseId,
                  locale,
                  nameText:
                    projection.facts.names[locale] ??
                    projection.facts.names.en ??
                    Object.values(projection.facts.names)[0] ??
                    null,
                  brandText:
                    projection.facts.brands
                      .map(
                        brand =>
                          brand.names[locale] ??
                          brand.names.en ??
                          Object.values(brand.names)[0],
                      )
                      .filter(Boolean)
                      .join(' · ') || null,
                },
              ]
            : [],
        }
      }
      const candidates = await searchSaanSeoiPlaces(client, {
        q: input.q,
        locale: input.locale,
        limit: input.limit,
      })
      return {
        source: 'saanseoi-latest' as const,
        candidates: candidates.filter(candidate => !rejected.has(candidate.placeId)),
      }
    } catch {
      error(502, 'PLACE_SEARCH_FAILED')
    }
  },
)

/**
 * Preview canonical facts for a source candidate before explicit Feature linking.
 * @param input Feature and selected SaanSeoi identity/release, without client facts.
 * @returns Accessible mirrored revision or an explicit source-import-needed result.
 * @remarks Requires the same inherited-field permissions as linking. Project scope
 * comes from persisted ancestry, never from the caller or search result labels.
 */
export const getFeaturePlaceCandidate = guardedQuery(
  z.strictObject({
    featureId: z.string().min(1),
    ssId: z.string().min(1).max(200),
    resourceReleaseId: z.string().min(1).max(200),
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
    return resolvePlaceCandidate(ctx.db, {
      projectId: probe.projectId,
      ssId: input.ssId,
      resourceReleaseId: input.resourceReleaseId,
    })
  },
)

/**
 * Search private manual/unresolved Places available for reuse in this Feature's project.
 * @param input Feature identity and a bounded literal name fragment.
 * @returns Latest local revisions with projected facts for explicit preview/linking.
 * @remarks Project ownership is derived from persisted ancestry; no client scope is accepted.
 */
export const searchFeatureLocalPlaces = guardedQuery(
  z.strictObject({
    featureId: z.string().min(1),
    q: z.string().trim().min(1).max(200),
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
    return searchLocalPlaceCandidates(ctx.db, {
      projectId: probe.projectId,
      q: input.q,
    })
  },
)

/**
 * Change one Feature's Place while preserving current values and explicit corrections.
 * @param input Destination identity and the Feature/association tokens shown to the editor.
 * @returns New association revision; stale requests fail without changing either Place.
 * @remarks Project and actor come from persisted/authenticated context. This does not
 * reconcile SaanSeoi ID churn or move other Features attached to the original Place.
 */
export const relinkFeaturePlace = guardedCommand(
  z.strictObject({
    featureId: z.string().min(1),
    placeId: z.string().min(1),
    revisionId: z.string().min(1),
    expectedFeatureModifiedAt: z.string().min(1),
    expectedRevision: z.string().min(1),
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
    const result = await persistFeatureRelink(ctx.db, {
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

/**
 * Unlink a persisted Feature without discarding its effective values.
 * @param input Feature identity and editor concurrency tokens.
 * @returns Detached revision; stale requests fail without mutation.
 * @remarks Requires every inherited field permission. Project and actor are server-derived.
 */
export const unlinkFeaturePlace = guardedCommand(
  z.strictObject({
    featureId: z.string().min(1),
    expectedFeatureModifiedAt: z.string().min(1),
    expectedRevision: z.string().min(1),
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
    const result = await persistFeatureUnlink(ctx.db, {
      ...input,
      projectId: probe.projectId,
      actorId: ctx.user.id,
    })
    if (result.status === 'conflict') error(409, 'PLACE_LINK_CHANGED')
    return result
  },
)

/**
 * Load a selected source candidate into the canonical mirror before explicit review.
 * @param input Feature and exact source identity/release selected in search.
 * @returns Accessible immutable candidate; no Feature association or adoption is performed.
 * @remarks Permissions precede source requests. Publication pins and facts come only
 * from the server. Release drift requires a new search; upstream diagnostics stay private.
 */
export const importFeaturePlaceCandidate = guardedCommand(
  z.strictObject({
    featureId: z.string().min(1),
    ssId: z.string().min(1).max(200),
    resourceReleaseId: z.string().min(1).max(200),
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
    const env = ctx.event.locals.platform?.env
    const apiKey = env?.SAANSEOI_API_KEY ?? env?.VITE_SAANSEOI_API_KEY
    if (!apiKey?.trim()) error(503, 'PLACE_SEARCH_UNAVAILABLE')
    const client = {
      ...placeSourceEndpoint(apiKey),
      fetch: ctx.event.fetch,
    }
    let found: Awaited<ReturnType<typeof findSaanSeoiPlace>>
    try {
      const publication = await discoverPlacePublication(client)
      found = await findSaanSeoiPlace(client, publication.pin, input.ssId)
    } catch {
      error(502, 'PLACE_SOURCE_LOOKUP_FAILED')
    }
    if (!found) error(404, 'PLACE_SOURCE_NOT_FOUND')
    if (
      found.projection.ssId !== input.ssId ||
      found.projection.releaseId !== input.resourceReleaseId
    )
      error(409, 'PLACE_SOURCE_CHANGED')
    let candidate: Awaited<ReturnType<typeof persistPlaceCandidate>>
    try {
      candidate = await persistPlaceCandidate(ctx.db, probe.projectId, found.projection)
    } catch {
      error(409, 'PLACE_CANDIDATE_UNAVAILABLE')
    }
    if (!candidate) error(409, 'PLACE_CANDIDATE_UNAVAILABLE')
    return candidate
  },
)
