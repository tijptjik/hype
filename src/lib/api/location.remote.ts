// SVELTE
import { error, isHttpError } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// REMOTE
import { guardedCommand, guardedQuery } from '#lib/api/server/guarded.js'
// AUTHORIZATION
import { requireLocationOrganisationManager } from '#lib/api/services/locationOwnership.js'
import {
  authorizeProjectUpdateForSubmission,
  authorizeFeatureReadForProbe,
  authorizeFeatureUpdateForSubmission,
} from '#lib/api/services/authz/index.js'
// DB
import { readFeaturePresentationPolicy } from '#lib/db/services/featurePresentationPolicy.js'
import { rejectedFeatureLocationSourceIds } from '#lib/db/services/locationIdentityRejection.js'
import { probeProjectQuery } from '#lib/db/services/project.js'
import { probeFeatureQuery } from '#lib/db/services/feature.js'
import {
  getAcceptedFeatureLocation,
  getProjectLocationSettings,
  saveProjectLocationSettings,
} from '#lib/db/services/location.js'
import { unlinkFeatureLocation as persistFeatureUnlink } from '#lib/db/services/locationUnlink.js'
import { getDetachedFeatureBrands } from '#lib/db/services/locationDetached.js'
import { createLocalLocation as persistLocalLocation } from '#lib/db/services/locationLocal.js'
import { linkInitialFeatureLocation } from '#lib/db/services/locationLink.js'
import { relinkFeatureLocation as persistFeatureRelink } from '#lib/db/services/locationRelink.js'
import {
  resolveLocationCandidate,
  persistLocationCandidate,
  searchLocalLocationCandidates,
  nearbyLocalLocationCandidates,
} from '#lib/db/services/locationCandidate.js'
import { LocalLocationInputSchema } from '#lib/locations/local.js'
// DOMAIN
import { ProjectLocationPolicySchema } from '#lib/locations/model.js'
import {
  PlaceSearchInputSchema,
  searchSaanSeoiPlaces,
} from '#lib/locations/sourceClient.js'
import { discoverLocationPublication } from '#lib/locations/publication.js'
import { findSaanSeoiPlace } from '#lib/locations/sourceLookup.js'
import { locationSourceEndpoint } from '#lib/locations/sourceEndpoint.server.js'
import { NearbyPlacesInputSchema } from '#lib/locations/discovery.js'
import { searchNearbySaanSeoiPlaces } from '#lib/locations/nearbySource.js'
import { readSaanSeoiPlacePreview } from '#lib/locations/sourcePreview.js'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. PROJECT SETTINGS AUTHORIZATION
// 2. POLICY READ / WRITE
// 3. ACCEPTED FEATURE PLACE AND DETACHED BRAND READS
// 4. LOCAL PLACE CREATION AND NEARBY DISCOVERY
// 5. INITIAL FEATURE ASSOCIATION
// 6. SOURCE DISCOVERY
// 7. CANDIDATE RESOLUTION
// 8. PRIVATE LOCAL DISCOVERY
// 9. EXPLICIT REASSOCIATION
// 10. EXPLICIT UNLINK
// 11. CANONICAL CANDIDATE IMPORT
// 12. READ-ONLY SEARCH DISPLAY DETAILS
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
    submittedData: { locationUpdatePolicy: true },
  })
  if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
}

/**
 * Read adoption settings for an authorized project manager.
 * @param input Project identity.
 * @returns Validated policy and its concurrency revision.
 */
export const getLocationUpdatePolicy = guardedQuery(
  projectInput,
  async (input, ctx) => {
    await requireProjectPolicyManager(ctx, input.projectId)
    return getProjectLocationSettings(ctx.db, input.projectId)
  },
)

/**
 * Save project-specific adoption rules with optimistic concurrency.
 * @param input Project, complete policy and revision from the preceding read.
 * @returns Saved policy and incremented revision.
 * @remarks No existing Feature or pending/rejected source change is replayed.
 */
export const setLocationUpdatePolicy = guardedCommand(
  projectInput.extend({
    policy: ProjectLocationPolicySchema,
    expectedRevision: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
  }),
  async (input, ctx) => {
    await requireProjectPolicyManager(ctx, input.projectId)
    const saved = await saveProjectLocationSettings(
      ctx.db,
      input.projectId,
      input.policy,
      input.expectedRevision,
    )
    if (!saved) error(409, 'LOCATION_POLICY_CHANGED')
    return saved
  },
)

/**
 * Read accepted Location values through the Feature's existing visibility permissions.
 * @param input Feature identity.
 * @returns Accepted Location projection, or null when unlinked or inaccessible by scope.
 * @remarks Does not expose raw snapshots or reveal other Features at the same Location.
 */
export const getFeatureLocation = guardedQuery(
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
    return getAcceptedFeatureLocation(ctx.db, input.featureId, probe.projectId)
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
 * Check whether the Feature editor may offer Organisation-owned Location creation.
 * @param input Project context whose persisted Organisation determines ownership.
 * @returns Only an access boolean; the create command repeats authorization before writing.
 */
export const getLocalLocationCreationAccess = guardedQuery(
  projectInput,
  async (input, ctx) => {
    if (ctx.user.isAnonymous) return { allowed: false }
    const project = await probeProjectQuery(ctx.db, {
      ref: input.projectId,
      refKey: 'id',
    })
    if (!project) return { allowed: false }
    try {
      await requireLocationOrganisationManager(ctx, project.organisationId)
      return { allowed: true }
    } catch (cause) {
      if (isHttpError(cause, 403) || isHttpError(cause, 404)) return { allowed: false }
      throw cause
    }
  },
)

/**
 * Create a private Location baseline owned by the selected Project's Organisation.
 * @param input Project context, intentional state and validated local facts.
 * @returns Stable HYPE identity and immutable initial revision.
 * @remarks No Feature or upstream SaanSeoi record is changed by creation.
 */
export const createLocalLocation = guardedCommand(
  projectInput.extend(LocalLocationInputSchema.shape),
  async (input, ctx) => {
    if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
    const project = await probeProjectQuery(ctx.db, {
      ref: input.projectId,
      refKey: 'id',
    })
    if (!project) error(404, 'PROJECT_NOT_FOUND')
    await requireLocationOrganisationManager(ctx, project.organisationId)
    return persistLocalLocation(
      ctx.db,
      project.organisationId,
      {
        state: input.state,
        facts: input.facts,
        parseSource: input.parseSource,
        sharingPreference: input.sharingPreference,
      },
      ctx.user.id,
    )
  },
)

/**
 * Read the discovery radius through the Feature editor's existing permissions.
 * @param input Feature identity; its Project is resolved server-side.
 * @returns Configured Project radius or the 300 metre default.
 */
export const getFeatureLocationDiscoverySettings = guardedQuery(
  z.strictObject({ featureId: z.string().min(1) }),
  async (input, ctx) => {
    const probe = await requireLocationDiscoveryEditor(ctx, input.featureId)
    const settings = await getProjectLocationSettings(ctx.db, probe.projectId)
    return { radius: settings.policy.discoveryRadiusMetres ?? 300 }
  },
)

/**
 * Authorize discovery before any source requests or private catalogue reads.
 * @param ctx Request context. @param featureId Persisted Feature identity.
 * @returns Authorized Feature ancestry.
 */
async function requireLocationDiscoveryEditor(
  ctx: GuardedBaseContext,
  featureId: string,
): Promise<NonNullable<Awaited<ReturnType<typeof probeFeatureQuery>>>> {
  const probe = await probeFeatureQuery(ctx.db, { ref: featureId, refKey: 'id' })
  if (!probe) error(404, 'FEATURE_NOT_FOUND')
  const decision = authorizeFeatureUpdateForSubmission({
    user: ctx.user,
    userRoles: ctx.userRoles,
    resource: probe,
    submittedData: { i18n: true, properties: true, geometry: true, addressMeta: true },
  })
  if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
  return probe
}

/**
 * Discover nearby source Locations for an authorized Feature editor.
 * @param input Feature identity, draft pin and bounded radius.
 * @returns Read-only candidates and explicit completeness indicators.
 * @remarks Pins may come from an unsaved draft; authority always comes from the stored Feature.
 */
export const searchFeatureNearbyLocations = guardedQuery(
  NearbyPlacesInputSchema.extend({ featureId: z.string().min(1) }),
  async (input, ctx) => {
    const probe = await requireLocationDiscoveryEditor(ctx, input.featureId)
    const env = ctx.event.locals.platform?.env
    const apiKey = env?.SAANSEOI_API_KEY ?? env?.VITE_SAANSEOI_API_KEY
    if (!apiKey?.trim()) error(503, 'LOCATION_SEARCH_UNAVAILABLE')
    const rejected = await rejectedFeatureLocationSourceIds(
      ctx.db,
      input.featureId,
      probe.projectId,
    )
    try {
      const found = await searchNearbySaanSeoiPlaces(
        { ...locationSourceEndpoint(apiKey), fetch: ctx.event.fetch },
        { coordinates: input.coordinates, radius: input.radius },
      )
      return {
        ...found,
        candidates: found.candidates.filter(row => !rejected.has(row.placeId)),
      }
    } catch {
      error(502, 'LOCATION_SEARCH_FAILED')
    }
  },
)

/**
 * Discover nearby private Locations within the Feature's owning Organisation.
 * @param input Feature identity and bounded draft search circle.
 * @returns Accessible local previews; unrelated Organisations are excluded in SQL.
 */
export const searchFeatureNearbyLocalLocations = guardedQuery(
  NearbyPlacesInputSchema.extend({ featureId: z.string().min(1) }),
  async (input, ctx) => {
    const probe = await requireLocationDiscoveryEditor(ctx, input.featureId)
    return nearbyLocalLocationCandidates(ctx.db, {
      ...input,
      projectId: probe.projectId,
    })
  },
)

/**
 * Read latest-source display facts without depending on canonical import support.
 * @param input Authorized Feature and candidate identity/release.
 * @returns Explicitly noncanonical preview facts; no database writes occur.
 */
export const getFeatureLocationDiscoveryDetails = guardedQuery(
  z.strictObject({
    featureId: z.string().min(1),
    ssId: z.string().min(1).max(200),
    resourceReleaseId: z.string().min(1).max(200),
  }),
  async (input, ctx) => {
    await requireLocationDiscoveryEditor(ctx, input.featureId)
    const env = ctx.event.locals.platform?.env
    const apiKey = env?.SAANSEOI_API_KEY ?? env?.VITE_SAANSEOI_API_KEY
    if (!apiKey?.trim()) error(503, 'LOCATION_SEARCH_UNAVAILABLE')
    try {
      return {
        source: 'saanseoi-latest-preview' as const,
        facts: await readSaanSeoiPlacePreview(
          { ...locationSourceEndpoint(apiKey), fetch: ctx.event.fetch },
          input,
        ),
      }
    } catch {
      error(502, 'LOCATION_SOURCE_PREVIEW_FAILED')
    }
  },
)

/**
 * Associate a Feature with an explicitly selected existing Location revision.
 * @param input Feature, selected Location/revision and the editor's Feature timestamp.
 * @returns New association token after preserving persisted effective values.
 * @remarks Authorizes all inheritable field groups against persisted ancestry. Source
 * identities, overrides, project scope and baseline facts cannot be supplied by the client.
 */
export const linkFeatureLocation = guardedCommand(
  z.strictObject({
    featureId: z.string().min(1),
    nameMode: z.enum(['independent', 'inherit']).optional(),
    locationId: z.string().min(1),
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
    const policy = await readFeaturePresentationPolicy(ctx.db, probe.layerId)
    const result = await linkInitialFeatureLocation(ctx.db, {
      ...input,
      ...(policy.locationBasedNames ? { nameMode: 'inherit' as const } : {}),
      projectId: probe.projectId,
      actorId: ctx.user.id,
      authorizeLocationCorrection: () =>
        requireLocationOrganisationManager(ctx, probe.organisationId),
    })
    if (result.status === 'conflict') error(409, 'LOCATION_LINK_CHANGED')
    if (result.status === 'place-unavailable') error(404, 'LOCATION_NOT_FOUND')
    if (result.status !== 'linked') error(422, 'LOCATION_LINK_REVIEW_REQUIRED')
    return result
  },
)

/**
 * Search upstream Locations for an editor allowed to associate the selected Feature.
 * @param input Feature identity and bounded discovery query; no client source URL or key.
 * @returns Latest-source candidates, explicitly distinguished from linkable revisions.
 * @remarks Authorization precedes external requests. Discovery neither writes source
 * records nor links Features, and upstream errors never masquerade as empty results.
 * `id:<canonical ID>` and canonical ss-UUIDs use a pinned exact lookup, never name search.
 */
export const searchFeatureLocations = guardedQuery(
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
    if (!apiKey?.trim()) error(503, 'LOCATION_SEARCH_UNAVAILABLE')
    try {
      const client = { ...locationSourceEndpoint(apiKey), fetch: ctx.event.fetch }
      const rejected = await rejectedFeatureLocationSourceIds(
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
        const publication = await discoverLocationPublication(client)
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
      error(502, 'LOCATION_SEARCH_FAILED')
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
export const getFeatureLocationCandidate = guardedQuery(
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
    return resolveLocationCandidate(ctx.db, {
      projectId: probe.projectId,
      ssId: input.ssId,
      resourceReleaseId: input.resourceReleaseId,
    })
  },
)

/**
 * Search private manual/unresolved Locations available for reuse in this Feature's project.
 * @param input Feature identity and a bounded literal name fragment.
 * @returns Latest local revisions with projected facts for explicit preview/linking.
 * @remarks Project ownership is derived from persisted ancestry; no client scope is accepted.
 */
export const searchFeatureLocalLocations = guardedQuery(
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
    return searchLocalLocationCandidates(ctx.db, {
      projectId: probe.projectId,
      q: input.q,
    })
  },
)

/**
 * Change one Feature's Location while preserving current values and explicit corrections.
 * @param input Destination identity and the Feature/association tokens shown to the editor.
 * @returns New association revision; stale requests fail without changing either Location.
 * @remarks Project and actor come from persisted/authenticated context. This does not
 * reconcile SaanSeoi ID churn or move other Features attached to the original Location.
 */
export const relinkFeatureLocation = guardedCommand(
  z.strictObject({
    featureId: z.string().min(1),
    nameMode: z.enum(['independent', 'inherit']).optional(),
    locationId: z.string().min(1),
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
    const policy = await readFeaturePresentationPolicy(ctx.db, probe.layerId)
    const result = await persistFeatureRelink(ctx.db, {
      ...input,
      ...(policy.locationBasedNames ? { nameMode: 'inherit' as const } : {}),
      projectId: probe.projectId,
      actorId: ctx.user.id,
      authorizeLocationCorrection: () =>
        requireLocationOrganisationManager(ctx, probe.organisationId),
    })
    if (result.status === 'conflict') error(409, 'LOCATION_LINK_CHANGED')
    if (result.status === 'place-unavailable') error(404, 'LOCATION_NOT_FOUND')
    if (result.status !== 'linked') error(422, 'LOCATION_LINK_REVIEW_REQUIRED')
    return result
  },
)

/**
 * Unlink a persisted Feature without discarding its effective values.
 * @param input Feature identity and editor concurrency tokens.
 * @returns Detached revision; stale requests fail without mutation.
 * @remarks Requires every inherited field permission. Project and actor are server-derived.
 */
export const unlinkFeatureLocation = guardedCommand(
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
    if (result.status === 'conflict') error(409, 'LOCATION_LINK_CHANGED')
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
export const importFeatureLocationCandidate = guardedCommand(
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
    if (!apiKey?.trim()) error(503, 'LOCATION_SEARCH_UNAVAILABLE')
    const client = {
      ...locationSourceEndpoint(apiKey),
      fetch: ctx.event.fetch,
    }
    let found: Awaited<ReturnType<typeof findSaanSeoiPlace>>
    try {
      const publication = await discoverLocationPublication(client)
      found = await findSaanSeoiPlace(client, publication.pin, input.ssId)
    } catch {
      error(502, 'LOCATION_SOURCE_LOOKUP_FAILED')
    }
    if (!found) error(404, 'LOCATION_SOURCE_NOT_FOUND')
    if (
      found.projection.ssId !== input.ssId ||
      found.projection.releaseId !== input.resourceReleaseId
    )
      error(409, 'LOCATION_SOURCE_CHANGED')
    let candidate: Awaited<ReturnType<typeof persistLocationCandidate>>
    try {
      candidate = await persistLocationCandidate(
        ctx.db,
        probe.projectId,
        found.projection,
      )
    } catch {
      error(409, 'LOCATION_CANDIDATE_UNAVAILABLE')
    }
    if (!candidate) error(409, 'LOCATION_CANDIDATE_UNAVAILABLE')
    return candidate
  },
)

/** Read canonical geometry and address for numbered search previews without importing.
 * @param input Authorized Feature and exact candidate identity/release.
 * @returns Display facts only, with no source payload or credentials.
 * @remarks Search previews never create a Location or change a Feature association.
 */
export const getFeatureLocationSearchDetails = guardedQuery(
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
    if (!apiKey?.trim()) error(503, 'LOCATION_SEARCH_UNAVAILABLE')
    const client = {
      ...locationSourceEndpoint(apiKey),
      fetch: ctx.event.fetch,
    }
    let found: Awaited<ReturnType<typeof findSaanSeoiPlace>>
    try {
      const publication = await discoverLocationPublication(client)
      found = await findSaanSeoiPlace(client, publication.pin, input.ssId)
    } catch {
      error(502, 'LOCATION_SOURCE_LOOKUP_FAILED')
    }
    if (!found) error(404, 'LOCATION_SOURCE_NOT_FOUND')
    if (
      found.projection.ssId !== input.ssId ||
      found.projection.releaseId !== input.resourceReleaseId
    )
      error(409, 'LOCATION_SOURCE_CHANGED')
    return { facts: found.projection.facts }
  },
)
