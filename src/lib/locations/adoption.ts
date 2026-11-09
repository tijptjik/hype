// VALIDATION
import { z } from 'zod'
import { FeatureLocationOverridesSchema, LocationFactsSchema } from './validation'
// DOMAIN
import { equalLocationValue } from './baseline'
import { evaluateLocationAdoption } from './policy'
import { resolveFeatureLocation } from './resolve'
// TYPES
import type { LocationFacts, FeatureLocationOverrides } from './model'
import type { LocationChangeEvidence, LocationAdoptionDecision } from './policy'
import type { EffectiveLocationFacts } from './resolve'

export type AdoptionSourceRevision = {
  id: string
  locationId: string
  version: number
  ssId: string | null
  origin: 'local' | 'saanseoi'
  facts: LocationFacts
  rawSource: Record<string, unknown>
}
export type LocationAdoptionPlan = {
  comparison: LocationChangeEvidence
  decision: LocationAdoptionDecision
  blockers: Array<
    | 'source-identity'
    | 'establishment-evidence'
    | 'address-dependencies'
    | 'source-phone-omissions'
    | 'lifecycle-review'
  >
  factsRevisionId: string
  locationRevisionId: string
  effective: EffectiveLocationFacts
  before: EffectiveLocationFacts
  candidate: EffectiveLocationFacts
  source: {
    beforeFacts: LocationFacts
    beforeLocation: LocationFacts['location']
    candidate: LocationFacts
    establishmentBefore: {
      basicCategory: string | null
      taxonomy: { primary: string | null; [key: string]: unknown }
      operatingStatus: string | null
    } | null
    establishmentCandidate: {
      basicCategory: string | null
      taxonomy: { primary: string | null; [key: string]: unknown }
      operatingStatus: string | null
    } | null
  }
}

/** Persisted assessments may retain the original inner `evidence` key. */
export type StoredLocationAdoptionPlan =
  | LocationAdoptionPlan
  | (Omit<LocationAdoptionPlan, 'comparison'> & { evidence: LocationChangeEvidence })

/**
 * Expose historical assessments using the current comparison name.
 * @param plan Stored assessment with the current or legacy comparison key.
 * @returns Plan with an unambiguous comparison field.
 * @remarks Normalizes reads only; immutable stored evidence is never rewritten.
 */
export function readLocationAdoptionPlan(
  plan: StoredLocationAdoptionPlan,
): LocationAdoptionPlan {
  if ('comparison' in plan) return plan
  const { evidence, ...assessment } = plan
  return { ...assessment, comparison: evidence }
}

const establishmentSchema = z.object({
  resource: z.object({
    attributes: z.object({
      basicCategory: z.string().nullable(),
      taxonomy: z.object({ primary: z.string().nullable() }).passthrough(),
      operatingStatus: z.string().nullable(),
    }),
  }),
})

/**
 * Compare address content without treating publication metadata as a premises change.
 * @param address Pinned address projection.
 * @returns Content and identity evidence, retaining unknown structured address fields.
 * @remarks Only top-level response metadata and resource snapshot/source attribution are
 * excluded; formatted addresses, membership and inventory content remain address evidence.
 * Selected unit content is compared independently by the unit policy.
 */
function addressContent(address: LocationFacts['location']['address']): unknown {
  /** Strip publication-only attributes. @param value JSON:API resource. @returns Comparable content. */
  const resource = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value
    const { attributes, ...rest } = value as Record<string, unknown>
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes))
      return value
    const {
      snapshotId: _snapshot,
      sources: _sources,
      units: _units,
      ...content
    } = attributes as Record<string, unknown>
    return { ...rest, attributes: content }
  }
  const { meta: _meta, links: _links, data, included, ...rest } = address.rawSource
  return {
    authored: address.authored
      ? { ...address.authored, unit: undefined, unitI18n: undefined }
      : undefined,
    status: address.status,
    address2dId: address.address2dId,
    address3dId: address.address3dId,
    fallbackDisplay: address.fallbackDisplay,
    rawSource: {
      ...rest,
      data: resource(data),
      included: Array.isArray(included) ? included.map(resource) : included,
    },
  }
}

/**
 * Extract only the referenced unit, so unrelated shops do not trigger this Feature's review.
 * @param address Pinned address projection.
 * @returns Unit identity and retained structured content.
 */
function unitContent(address: LocationFacts['location']['address']): unknown {
  const inventories = Array.isArray(address.rawSource.included)
    ? address.rawSource.included
    : []
  const inventory = inventories.find(
    value =>
      value &&
      typeof value === 'object' &&
      'id' in value &&
      value.id === address.address3dId,
  ) as { attributes?: { units?: unknown[] } } | undefined
  const unit = inventory?.attributes?.units?.find(
    value =>
      value &&
      typeof value === 'object' &&
      'id' in value &&
      value.id === address.address3dUnitId,
  )
  return {
    id: address.address3dUnitId,
    unit: unit ?? address.authored?.unit ?? null,
    authoredI18n: address.authored?.unitI18n,
  }
}

/**
 * Build one Feature's adoption plan from its independently accepted source revisions.
 * @param input Stored revisions, explicit overrides and Project policy.
 * @returns Proposed revision inputs and effective values; no persistence or acceptance occurs.
 * @remarks Overrides survive unchanged. Missing evidence blocks automatic adoption even
 * under an automatic policy. Callers must retain rejection decisions and guard all input
 * revisions when applying this plan; this function never reopens a rejected proposal.
 */
export function planLocationAdoption(input: {
  facts: AdoptionSourceRevision
  location: AdoptionSourceRevision
  candidate: AdoptionSourceRevision
  overrides: FeatureLocationOverrides
  policy: unknown
  candidateOverrides?: FeatureLocationOverrides
}): LocationAdoptionPlan {
  const { facts, location, candidate } = input
  for (const revision of [facts, location, candidate]) {
    if (
      !revision.id ||
      revision.locationId !== candidate.locationId ||
      !Number.isSafeInteger(revision.version) ||
      revision.version < 1
    )
      throw new Error('Invalid Location adoption revision identity')
  }
  if (candidate.version < Math.max(facts.version, location.version))
    throw new Error('Location adoption cannot move accepted revisions backwards')
  const oldFacts = LocationFactsSchema.parse(facts.facts)
  const oldLocation = LocationFactsSchema.parse(location.facts).location
  const next = LocationFactsSchema.parse(candidate.facts)
  const overrides = FeatureLocationOverridesSchema.parse(input.overrides)
  const candidateOverrides = FeatureLocationOverridesSchema.parse(
    input.candidateOverrides ?? overrides,
  )
  const effectiveBefore = resolveFeatureLocation(oldFacts, oldLocation, overrides)
  const effectiveCandidate = resolveFeatureLocation(
    next,
    next.location,
    candidateOverrides,
  )
  const comparedBefore = effectiveBefore.location ?? oldLocation
  const comparedAfter = effectiveCandidate.location ?? next.location
  const beforeEstablishment = establishmentSchema.safeParse(facts.rawSource)
  const afterEstablishment = establishmentSchema.safeParse(candidate.rawSource)
  const blockers: LocationAdoptionPlan['blockers'] = []
  // A local revision chain has no publisher identity; crossing into source data still requires identity review.
  const localChain = [facts, location, candidate].every(
    revision => revision.origin === 'local' && revision.ssId === null,
  )
  if (
    !localChain &&
    (!candidate.ssId ||
      facts.ssId !== candidate.ssId ||
      location.ssId !== candidate.ssId)
  )
    blockers.push('source-identity')
  if (!localChain && (!beforeEstablishment.success || !afterEstablishment.success))
    blockers.push('establishment-evidence')
  const address = next.location.address
  if (
    address.status !== 'resolved' &&
    (address.address2dId || address.address3dId || address.address3dUnitId)
  )
    blockers.push('address-dependencies')
  if (
    Array.isArray(candidate.rawSource.issues) &&
    candidate.rawSource.issues.some(
      issue =>
        typeof issue === 'object' &&
        issue !== null &&
        'kind' in issue &&
        issue.kind === 'invalidPhone',
    )
  )
    blockers.push('source-phone-omissions')
  const comparison: LocationChangeEvidence = {
    before: comparedBefore,
    after: comparedAfter,
    addressChanged: !equalLocationValue(
      addressContent(comparedBefore.address),
      addressContent(comparedAfter.address),
    ),
    unitChanged: !equalLocationValue(
      unitContent(comparedBefore.address),
      unitContent(comparedAfter.address),
    ),
    establishmentChanged:
      !equalLocationValue(
        effectiveBefore.footprint ?? null,
        effectiveCandidate.footprint ?? null,
      ) ||
      !equalLocationValue(oldFacts.entity ?? null, next.entity ?? null) ||
      !equalLocationValue(effectiveBefore.names, effectiveCandidate.names) ||
      !equalLocationValue(effectiveBefore.brands, effectiveCandidate.brands) ||
      (!localChain &&
        (!beforeEstablishment.success ||
          !afterEstablishment.success ||
          !equalLocationValue(beforeEstablishment.data, afterEstablishment.data))),
  }
  const decision = evaluateLocationAdoption(comparison, input.policy)
  // Status and successor changes require review even under an automatic adoption policy.
  if (
    ['operatingStatus', 'buildingStatus', 'successorLocationId'].some(key => {
      const field = key as 'operatingStatus' | 'buildingStatus' | 'successorLocationId'
      return !equalLocationValue(effectiveBefore[field], effectiveCandidate[field])
    })
  ) {
    blockers.push('lifecycle-review')
    decision.facts = 'review'
  }
  // Incomplete source evidence cannot silently erase inherited values.
  if (
    blockers.some(
      value => value !== 'address-dependencies' && value !== 'lifecycle-review',
    )
  ) {
    decision.facts = 'review'
    decision.location = 'review'
  } else if (blockers.includes('address-dependencies')) decision.location = 'review'
  const acceptedFacts = decision.facts === 'adopt' ? next : oldFacts
  const acceptedLocation = decision.location === 'adopt' ? next.location : oldLocation
  const acceptedOverrides = { ...overrides }
  if (decision.facts === 'adopt')
    for (const key of [
      'footprint',
      'names',
      'phoneNumber',
      'brands',
      'operatingStatus',
      'buildingStatus',
      'successorLocationId',
    ] as const) {
      delete acceptedOverrides[key]
      if (candidateOverrides[key] !== undefined)
        Object.assign(acceptedOverrides, { [key]: candidateOverrides[key] })
    }
  if (decision.location === 'adopt') {
    delete acceptedOverrides.location
    if (candidateOverrides.location !== undefined)
      acceptedOverrides.location = candidateOverrides.location
  }
  return {
    comparison,
    decision,
    blockers,
    factsRevisionId: decision.facts === 'adopt' ? candidate.id : facts.id,
    locationRevisionId: decision.location === 'adopt' ? candidate.id : location.id,
    effective: resolveFeatureLocation(
      acceptedFacts,
      acceptedLocation,
      acceptedOverrides,
    ),
    before: resolveFeatureLocation(oldFacts, oldLocation, overrides),
    candidate: effectiveCandidate,
    source: {
      beforeFacts: oldFacts,
      beforeLocation: oldLocation,
      candidate: next,
      establishmentBefore: beforeEstablishment.success
        ? beforeEstablishment.data.resource.attributes
        : null,
      establishmentCandidate: afterEstablishment.success
        ? afterEstablishment.data.resource.attributes
        : null,
    },
  }
}
