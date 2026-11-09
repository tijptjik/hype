// DOMAIN
import { normalizeNameSearch } from '#lib/addresses/nameSearch.js'
import { associationMatch, associationGroupDiffers } from './associationMatch'
import { locationDistance } from './searchPresentation'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type { SaanSeoiPlaceProjection } from './saanseoi'

/** Rank an establishment candidate using authored names, address components and a 100 m circle.
 * @param address Retained Feature-owned intent and selected address components.
 * @param projection Verified canonical establishment from an immutable publication.
 * @returns Review evidence, or null when kind, localized name or spatial evidence is insufficient.
 * @remarks A score is evidence, never identity proof. Number ranges remain distinct from entrances.
 */
export function scoreLocationRematch(
  address: FeatureAddress,
  projection: SaanSeoiPlaceProjection,
): {
  score: number
  distance: number
  exact: boolean
  numberConflict: boolean
} | null {
  const association = address.association
  if (
    association?.mode !== 'unlinked' ||
    association.kind !== 'establishment' ||
    !address.coordinates
  )
    return null
  const distance = locationDistance(
    address.coordinates,
    projection.facts.location.geometry.coordinates,
  )
  if (!Number.isFinite(distance) || distance > 100) return null
  const names = Object.values(association.names)
    .map(normalizeNameSearch)
    .filter(Boolean)
  if (
    !Object.values(projection.facts.names).some(name =>
      names.includes(normalizeNameSearch(name)),
    )
  )
    return null
  const candidate: FeatureAddress = {
    version: 1,
    source: projection.facts.location.address,
    coordinates: projection.facts.location.geometry.coordinates,
    matchStatus: projection.facts.location.address.status,
    overrides: {},
  }
  const evidence = associationMatch(
    { id: 'origin', kind: 'establishment', names: association.names, address },
    {
      id: projection.ssId,
      kind: 'establishment',
      names: projection.facts.names,
      address: candidate,
    },
  )
  return {
    ...evidence,
    distance,
    numberConflict: associationGroupDiffers(address, candidate, 'number'),
  }
}
