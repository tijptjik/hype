// VALIDATION
import {
  DEFAULT_PROJECT_LOCATION_POLICY,
  ProjectLocationPolicySchema,
  locationRulesForOrigin,
} from './model'
// TYPES
import type { LocationPosition } from './model'

export type LocationChangeEvidence = {
  before: LocationPosition
  after: LocationPosition
  addressChanged: boolean
  unitChanged: boolean
  establishmentChanged: boolean
  communicationsChanged?: boolean
  origin?: 'saanseoi' | 'community'
  missing?: Partial<
    Record<'establishment' | 'communications' | 'address' | 'unit', boolean>
  >
}

export type LocationAdoptionDecision = {
  facts: 'adopt' | 'review'
  location: 'adopt' | 'review'
  distanceMetres: number
  reasons: Array<
    'coordinates' | 'address' | 'unit' | 'establishment' | 'communications'
  >
}

/**
 * Measure source displacement in metres, rejecting invalid source geometry.
 * @param before Previous accepted location.
 * @param after Proposed location.
 * @returns Great-circle distance; this is not a pedestrian routing distance.
 */
function displacement(before: LocationPosition, after: LocationPosition): number {
  const points = [before.geometry.coordinates, after.geometry.coordinates]
  for (const [lon, lat] of points) {
    if (
      !Number.isFinite(lon) ||
      !Number.isFinite(lat) ||
      Math.abs(lon) > 180 ||
      Math.abs(lat) > 90
    ) {
      throw new Error('Invalid Location coordinates')
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
export function evaluateLocationAdoption(
  evidence: LocationChangeEvidence,
  input: unknown = DEFAULT_PROJECT_LOCATION_POLICY,
): LocationAdoptionDecision {
  const policy = locationRulesForOrigin(
    ProjectLocationPolicySchema.parse(input),
    evidence.origin ?? 'saanseoi',
  )
  const exempt = (
    field: 'address' | 'unit' | 'establishment' | 'communications',
  ): boolean =>
    Boolean(policy.acceptMissing && evidence.missing?.[field]) ||
    Boolean(
      policy.acceptUnresolved &&
        (field === 'address' || field === 'unit') &&
        evidence.before.address.status === 'unresolved' &&
        evidence.after.address.status === 'resolved',
    )
  const distanceMetres = displacement(evidence.before, evidence.after)
  const reasons: LocationAdoptionDecision['reasons'] = []
  // Independent controls combine conservatively: any review holds the location group.
  if (
    distanceMetres > 0 &&
    (policy.coordinates.mode === 'review' ||
      (policy.coordinates.mode === 'withinDistance' &&
        distanceMetres > policy.coordinates.maxMetres))
  ) {
    reasons.push('coordinates')
  }
  if (evidence.addressChanged && policy.address === 'review' && !exempt('address'))
    reasons.push('address')
  if (evidence.unitChanged && policy.unit === 'review' && !exempt('unit'))
    reasons.push('unit')
  if (
    evidence.establishmentChanged &&
    policy.establishment === 'review' &&
    !exempt('establishment')
  )
    reasons.push('establishment')
  if (
    evidence.communicationsChanged &&
    policy.communications === 'review' &&
    !exempt('communications')
  )
    reasons.push('communications')
  return {
    facts:
      reasons.includes('establishment') || reasons.includes('communications')
        ? 'review'
        : 'adopt',
    location: reasons.some(reason => reason !== 'communications') ? 'review' : 'adopt',
    distanceMetres,
    reasons,
  }
}
