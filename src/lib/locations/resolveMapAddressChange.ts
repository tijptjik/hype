// API
import {
  geocodeAddressCandidates,
  loadGeocodedAddressUnits,
} from '#lib/api/external/geocoding.js'
import { findDraftAddressLocation } from '#lib/api/addressLocation.remote.js'
// ADDRESS
import { getAddressDisplay } from '#lib/addresses/featureAddress.js'
import {
  applyMapAddressChange,
  customMapAddressChange,
  exactAddressChangeMatch,
} from '#lib/addresses/mapAddressChange.js'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type { MapAddressDisagreement } from '#lib/addresses/mapAddressDisagreement.js'

export type MapAddressChange = {
  address: FeatureAddress
  identity?: { locationId: string; revisionId: string }
}

/** Resolve an accepted correction without treating nearby or partial results as exact matches.
 * @param input Current address, displayed differences, authorised Project and visibility.
 * @param isCurrent Whether the request still belongs to the same draft and marker.
 * @returns Matched address/Location or a custom draft; null for obsolete work.
 * @remarks Lookups enrich an explicitly accepted draft; unavailable providers or
 * local discovery do not prevent a custom address. Ambiguous/truncated matches
 * still require review. Persistence and its authorization remain with normal Save.
 */
export async function resolveMapAddressChange(
  input: {
    address: FeatureAddress
    pin?: [number, number]
    conflicts: readonly MapAddressDisagreement[]
    projectId: string
    visibility: 'shared' | 'exclusive'
  },
  isCurrent: () => boolean,
): Promise<MapAddressChange | null> {
  const proposed = applyMapAddressChange(
    { ...input.address, coordinates: input.pin ?? input.address.coordinates },
    input.conflicts,
  )
  const query =
    getAddressDisplay(proposed, 'en') ||
    getAddressDisplay(proposed, 'zhHant') ||
    getAddressDisplay(proposed, 'zhHans')
  // A lookup is optional evidence; a custom draft does not claim a provider identity.
  const results = await geocodeAddressCandidates(
    { address: query },
    { limit: 50, candidateCoordinates: true },
  ).catch(() => [])
  if (!isCurrent()) return null
  const candidates = [
    ...new Map(
      results.flatMap(row => {
        const address = row.addressMeta.address
        return address && exactAddressChangeMatch(proposed, address)
          ? [[address.source.address2dId ?? JSON.stringify(address), address] as const]
          : []
      }),
    ).values(),
  ]
  if (candidates.length > 1 || results.length >= 50)
    throw new Error('ADDRESS_MATCH_REVIEW_REQUIRED')
  const address = candidates.length
    ? await loadGeocodedAddressUnits(candidates[0]).catch(() => candidates[0])
    : customMapAddressChange(proposed)
  if (!isCurrent()) return null
  const existing = input.projectId.trim()
    ? await findDraftAddressLocation({
        projectId: input.projectId,
        visibility: input.visibility,
        address,
      }).catch(cause => {
        // Ambiguity is a decision, not an unavailable optional enrichment request.
        if (
          cause instanceof Error &&
          (cause.message.includes('ADDRESS_MATCH_REVIEW_REQUIRED') ||
            ('status' in cause && cause.status === 409))
        )
          throw cause
        return null
      })
    : null
  if (!isCurrent()) return null
  const next: FeatureAddress = existing?.address ?? address
  // Unit/direction corrections belong to the Feature and survive identity resolution.
  return {
    address: {
      ...next,
      unitDetails: proposed.unitDetails,
      accessHints: proposed.accessHints,
      divisionOverrides: proposed.divisionOverrides,
      legacy: { ...proposed.legacy, ...next.legacy },
    },
    ...(existing
      ? {
          identity: {
            locationId: existing.locationId,
            revisionId: existing.revisionId,
          },
        }
      : {}),
  }
}
