// VALIDATION
import { z } from 'zod'
import { FeaturePlaceOverridesSchema, PlaceFactsSchema } from './validation'
// DOMAIN
import { equalPlaceValue } from './baseline'
import { evaluatePlaceAdoption } from './policy'
import { resolveFeaturePlace } from './resolve'
// TYPES
import type { PlaceFacts, FeaturePlaceOverrides } from './model'
import type { PlaceChangeEvidence, PlaceAdoptionDecision } from './policy'
import type { EffectivePlaceFacts } from './resolve'

export type AdoptionSourceRevision = {
  id: string
  placeId: string
  sequence: number
  ssId: string | null
  origin: 'local' | 'saanseoi'
  facts: PlaceFacts
  payload: Record<string, unknown>
}
export type PlaceAdoptionPlan = {
  evidence: PlaceChangeEvidence
  decision: PlaceAdoptionDecision
  blockers: Array<
    | 'source-identity'
    | 'establishment-evidence'
    | 'address-dependencies'
    | 'source-phone-omissions'
  >
  factsRevisionId: string
  locationRevisionId: string
  effective: EffectivePlaceFacts
  before: EffectivePlaceFacts
  candidate: EffectivePlaceFacts
  source: {
    beforeFacts: PlaceFacts
    beforeLocation: PlaceFacts['location']
    candidate: PlaceFacts
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
function addressContent(address: PlaceFacts['location']['address']): unknown {
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
  const { meta: _meta, links: _links, data, included, ...rest } = address.records
  return {
    status: address.status,
    address2dId: address.address2dId,
    address3dId: address.address3dId,
    fallbackDisplay: address.fallbackDisplay,
    records: {
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
function unitContent(address: PlaceFacts['location']['address']): unknown {
  const inventories = Array.isArray(address.records.included)
    ? address.records.included
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
  return { id: address.address3dUnitId, unit: unit ?? null }
}

/**
 * Build one Feature's adoption plan from its independently accepted source revisions.
 * @param input Stored revisions, explicit overrides and Project policy.
 * @returns Proposed revision inputs and effective values; no persistence or acceptance occurs.
 * @remarks Overrides survive unchanged. Missing evidence blocks automatic adoption even
 * under an automatic policy. Callers must retain rejection decisions and guard all input
 * revisions when applying this plan; this function never reopens a rejected proposal.
 */
export function planPlaceAdoption(input: {
  facts: AdoptionSourceRevision
  location: AdoptionSourceRevision
  candidate: AdoptionSourceRevision
  overrides: FeaturePlaceOverrides
  policy: unknown
}): PlaceAdoptionPlan {
  const { facts, location, candidate } = input
  for (const revision of [facts, location, candidate]) {
    if (
      !revision.id ||
      revision.placeId !== candidate.placeId ||
      !Number.isSafeInteger(revision.sequence) ||
      revision.sequence < 1
    )
      throw new Error('Invalid Place adoption revision identity')
  }
  if (candidate.sequence < Math.max(facts.sequence, location.sequence))
    throw new Error('Place adoption cannot move accepted revisions backwards')
  const oldFacts = PlaceFactsSchema.parse(facts.facts)
  const oldLocation = PlaceFactsSchema.parse(location.facts).location
  const next = PlaceFactsSchema.parse(candidate.facts)
  const overrides = FeaturePlaceOverridesSchema.parse(input.overrides)
  const beforeEstablishment = establishmentSchema.safeParse(facts.payload)
  const afterEstablishment = establishmentSchema.safeParse(candidate.payload)
  const blockers: PlaceAdoptionPlan['blockers'] = []
  if (
    candidate.origin !== 'saanseoi' ||
    !candidate.ssId ||
    facts.ssId !== candidate.ssId ||
    location.ssId !== candidate.ssId
  )
    blockers.push('source-identity')
  if (!beforeEstablishment.success || !afterEstablishment.success)
    blockers.push('establishment-evidence')
  const address = next.location.address
  if (
    address.status !== 'resolved' &&
    (address.address2dId || address.address3dId || address.address3dUnitId)
  )
    blockers.push('address-dependencies')
  if (
    Array.isArray(candidate.payload.issues) &&
    candidate.payload.issues.some(
      issue =>
        typeof issue === 'object' &&
        issue !== null &&
        'kind' in issue &&
        issue.kind === 'invalidPhone',
    )
  )
    blockers.push('source-phone-omissions')
  const evidence: PlaceChangeEvidence = {
    before: oldLocation,
    after: next.location,
    addressChanged: !equalPlaceValue(
      addressContent(oldLocation.address),
      addressContent(address),
    ),
    unitChanged: !equalPlaceValue(
      unitContent(oldLocation.address),
      unitContent(address),
    ),
    establishmentChanged:
      !equalPlaceValue(oldFacts.names, next.names) ||
      !equalPlaceValue(oldFacts.brands, next.brands) ||
      !beforeEstablishment.success ||
      !afterEstablishment.success ||
      !equalPlaceValue(beforeEstablishment.data, afterEstablishment.data),
  }
  const decision = evaluatePlaceAdoption(evidence, input.policy)
  // Incomplete source evidence cannot silently erase inherited values.
  if (blockers.some(value => value !== 'address-dependencies')) {
    decision.facts = 'review'
    decision.location = 'review'
  } else if (blockers.includes('address-dependencies')) decision.location = 'review'
  const acceptedFacts = decision.facts === 'adopt' ? next : oldFacts
  const acceptedLocation = decision.location === 'adopt' ? next.location : oldLocation
  return {
    evidence,
    decision,
    blockers,
    factsRevisionId: decision.facts === 'adopt' ? candidate.id : facts.id,
    locationRevisionId: decision.location === 'adopt' ? candidate.id : location.id,
    effective: resolveFeaturePlace(acceptedFacts, acceptedLocation, overrides),
    before: resolveFeaturePlace(oldFacts, oldLocation, overrides),
    candidate: resolveFeaturePlace(next, next.location, overrides),
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
