// VALIDATION
import { DEFAULT_PROJECT_PLACE_POLICY, ProjectPlacePolicySchema } from './model'
// TYPES
import type { PlaceLocation } from './model'

export type PlaceChangeEvidence = {
  before: PlaceLocation
  after: PlaceLocation
  addressChanged: boolean
  unitChanged: boolean
  establishmentChanged: boolean
}

export type PlaceAdoptionDecision = {
  facts: 'adopt' | 'review'
  location: 'adopt' | 'review'
  distanceMetres: number
  reasons: Array<'coordinates' | 'address' | 'unit' | 'establishment'>
}

/**
 * Measure source displacement in metres, rejecting invalid source geometry.
 * @param before Previous accepted location.
 * @param after Proposed location.
 * @returns Great-circle distance; this is not a pedestrian routing distance.
 */
function displacement(before: PlaceLocation, after: PlaceLocation): number {
  const points = [before.geometry.coordinates, after.geometry.coordinates]
  for (const [lon, lat] of points) {
    if (
      !Number.isFinite(lon) ||
      !Number.isFinite(lat) ||
      Math.abs(lon) > 180 ||
      Math.abs(lat) > 90
    ) {
      throw new Error('Invalid Place coordinates')
    }
  }
  const [[lon1, lat1], [lon2, lat2]] = points
  const radians = Math.PI / 180
  const a =
    Math.sin(((lat2 - lat1) * radians) / 2) ** 2 +
    Math.cos(lat1 * radians) *
      Math.cos(lat2 * radians) *
      Math.sin(((lon2 - lon1) * radians) / 2) ** 2
  return (
    6371008.8 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)))
  )
}

/**
 * Evaluate one project's adoption independently of shared source mirror refresh.
 * @param evidence Changes relative to this Feature's accepted revision.
 * @param input Validated project policy; absence uses review as the default.
 * @returns Decisions for facts and the atomic geometry/address/unit group.
 * @remarks Identity review holds all source facts. Other review holds only location.
 * Callers must not automatically reconsider previously rejected revisions.
 */
export function evaluatePlaceAdoption(
  evidence: PlaceChangeEvidence,
  input: unknown = DEFAULT_PROJECT_PLACE_POLICY,
): PlaceAdoptionDecision {
  const policy = ProjectPlacePolicySchema.parse(input)
  const distanceMetres = displacement(evidence.before, evidence.after)
  const reasons: PlaceAdoptionDecision['reasons'] = []
  // Independent controls combine conservatively: any review holds the location group.
  if (
    distanceMetres > 0 &&
    (policy.coordinates.mode === 'review' ||
      (policy.coordinates.mode === 'withinDistance' &&
        distanceMetres > policy.coordinates.maxMetres))
  ) {
    reasons.push('coordinates')
  }
  if (evidence.addressChanged && policy.address === 'review') reasons.push('address')
  if (evidence.unitChanged && policy.unit === 'review') reasons.push('unit')
  if (evidence.establishmentChanged && policy.establishment === 'review')
    reasons.push('establishment')
  return {
    facts: reasons.includes('establishment') ? 'review' : 'adopt',
    location: reasons.length ? 'review' : 'adopt',
    distanceMetres,
    reasons,
  }
}
