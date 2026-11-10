// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// REMOTE
import { guardedQuery } from '#lib/api/server/guarded.js'
// AUTHORIZATION
import { requireLocationOrganisationManager } from '#lib/api/services/locationOwnership.js'
// DB
import { probeProjectQuery } from '#lib/db/services/project.js'
import { nearbyAssociationLocations } from '#lib/db/services/locationAssociationCandidates.js'
// DOMAIN
import { AssociationKindSchema } from '#lib/locations/association.js'

/** Search matching-kind Locations from an Address or another discovery family.
 * @param input Persisted project scope, chosen kind and original address coordinates.
 * @returns Accessible candidate identities without creating or linking records.
 * @remarks Ownership is resolved and authorized before private Location facts are loaded.
 */
export const searchDraftAssociationLocations = guardedQuery(
  z.strictObject({
    projectId: z.string().min(1),
    kind: AssociationKindSchema,
    coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  }),
  async (input, ctx) => {
    if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
    const project = await probeProjectQuery(ctx.db, {
      ref: input.projectId,
      refKey: 'id',
    })
    if (!project) error(404, 'PROJECT_NOT_FOUND')
    await requireLocationOrganisationManager(ctx, project.organisationId)
    return nearbyAssociationLocations(ctx.db, input)
  },
)

/** Discover local and imported records of the intended kind before falling back to source evidence.
 * @param input Authorized project, intended kind and literal search text.
 * @returns Bounded readable records and explicit coverage information.
 */
export const searchTargetLocations = guardedQuery(
  z.strictObject({
    projectId: z.string().min(1),
    kind: AssociationKindSchema,
    q: z.string().trim().min(1).max(200),
  }),
  async (input, ctx) => {
    const project = await probeProjectQuery(ctx.db, {
      ref: input.projectId,
      refKey: 'id',
    })
    if (!project) error(404, 'PROJECT_NOT_FOUND')
    await requireLocationOrganisationManager(ctx, project.organisationId)
    const { listLocationResources } = await import(
      '#lib/db/services/locationDirectory.js'
    )
    return listLocationResources(ctx.db, {
      kind: input.kind,
      q: input.q,
      organisationId: project.organisationId,
      includeCount: false,
    })
  },
)
