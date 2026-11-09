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
import { nearbyLocalLocationCandidates } from '#lib/db/services/locationCandidate.js'
// ADDRESS
import { FeatureAddressSchema } from '#lib/addresses/featureAddress.js'
import { exactAddressChangeMatch } from '#lib/addresses/mapAddressChange.js'

/** Find an existing address Location for an explicitly accepted map correction.
 * @param input Project ownership, corrected address and requested visibility.
 * @returns One exact identity and its recorded address, or null after a complete no-match lookup.
 * @remarks Authorisation and private visibility precede matching. Ambiguous or truncated
 * discovery requires review; it must never silently create a duplicate custom Location.
 */
export const findDraftAddressLocation = guardedQuery(
  z.strictObject({
    projectId: z.string().min(1),
    address: FeatureAddressSchema,
    visibility: z.enum(['shared', 'exclusive']),
  }),
  async (input, ctx) => {
    if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
    const project = await probeProjectQuery(ctx.db, {
      ref: input.projectId,
      refKey: 'id',
    })
    if (!project) error(404, 'PROJECT_NOT_FOUND')
    await requireLocationOrganisationManager(ctx, project.organisationId)
    if (!input.address.coordinates) error(422, 'ADDRESS_COORDINATES_REQUIRED')
    // Reuse the scoped latest-revision discovery query; a name alone is never an identity.
    const found = await nearbyLocalLocationCandidates(ctx.db, {
      projectId: input.projectId,
      coordinates: input.address.coordinates,
      radius: 1000,
    })
    if (found.limited) error(409, 'ADDRESS_MATCH_REVIEW_REQUIRED')
    const matches = found.candidates.flatMap(row => {
      if (
        row.kind !== 'address' ||
        (input.visibility === 'exclusive') !== (row.state === 'manual')
      )
        return []
      const address = {
        version: 1 as const,
        source: row.facts.location.address,
        coordinates: row.facts.location.geometry.coordinates,
        matchStatus: row.facts.location.address.status,
        overrides: {},
      }
      return exactAddressChangeMatch(input.address, address)
        ? [{ locationId: row.locationId, revisionId: row.revisionId, address }]
        : []
    })
    if (matches.length > 1) error(409, 'ADDRESS_MATCH_REVIEW_REQUIRED')
    return matches[0] ?? null
  },
)
