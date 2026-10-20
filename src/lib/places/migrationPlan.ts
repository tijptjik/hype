// SHARED ADDRESS PARSER
import { ADDRESS_PARSER_VERSION, parseAddressContent } from '@saanseoi/address'
// DOMAIN
import { derivePlaceId } from './id.server'
import { LocalPlaceInputSchema } from './local'
import { preserveFeaturePlaceBaseline, equalPlaceValue } from './baseline'
import { resolveFeaturePlace } from './resolve'
// TYPES
import type { PersistedPlaceBaseline } from '#lib/db/services/placeBaseline.js'
import type { FeaturePlaceOverrides, PlaceFacts } from './model'

export type UnresolvedFeatureSplit = {
  version: 1
  featureId: string
  projectId: string
  expectedFeatureModifiedAt: string
  placeId: string
  revisionId: string
  state: 'unresolved'
  facts: PlaceFacts
  overrides: FeaturePlaceOverrides
  provenance: {
    kind: 'existing-feature-split'
    addressParserVersion?: string
    originalAddress: PersistedPlaceBaseline['address']
    legacyPropertyIds: string[]
  }
}

/**
 * Prepare a reproducible unresolved Place baseline without guessing establishment identity.
 * @param baseline Complete persisted Feature baseline from the migration assessment.
 * @returns A stable split proposal or an explicit reason requiring manual review.
 * @remarks No writes or source matching occur here. Local addresses cannot claim canonical
 * identity; original structured evidence stays in provenance and Feature overrides. Phone
 * normalization belongs to the Place projection while original Feature spelling survives.
 */
export function planUnresolvedFeatureSplit(
  baseline: PersistedPlaceBaseline,
):
  | { status: 'planned'; plan: UnresolvedFeatureSplit }
  | { status: 'review'; reason: string } {
  if (!baseline.effective.location)
    return { status: 'review', reason: 'missing-location' }
  const location = baseline.effective.location
  const parsed = LocalPlaceInputSchema.safeParse({
    state: 'unresolved',
    facts: {
      names: Object.fromEntries(
        Object.entries(baseline.effective.names).filter(
          (entry): entry is [string, string] => entry[1] !== null,
        ),
      ),
      phoneNumber: baseline.effective.phoneNumber ?? [],
      brands: baseline.effective.brands ?? [],
      location: {
        geometry: location.geometry,
        address: {
          status: 'unresolved',
          address2dId: null,
          address3dId: null,
          address3dUnitId: null,
          addressSnapshotId: null,
          records: {},
          fallbackDisplay: location.address.fallbackDisplay,
          authored:
            location.address.authored ??
            parseAddressContent(location.address.fallbackDisplay).content,
        },
      },
    },
  })
  if (!parsed.success) return { status: 'review', reason: 'invalid-local-baseline' }
  const facts = parsed.data.facts
  const overrides = preserveFeaturePlaceBaseline(
    baseline.effective,
    facts,
    facts.location,
  )
  // A plan is eligible only if resolving it reproduces every effective value exactly.
  if (
    !equalPlaceValue(
      resolveFeaturePlace(facts, facts.location, overrides),
      baseline.effective,
    )
  )
    return { status: 'review', reason: 'preservation-mismatch' }
  return {
    status: 'planned',
    plan: {
      version: 1,
      featureId: baseline.featureId,
      projectId: baseline.projectId,
      expectedFeatureModifiedAt: baseline.modifiedAt,
      placeId: derivePlaceId('feature-baseline', baseline.featureId),
      revisionId: `featurePlaceBaseline_${baseline.featureId}`,
      state: 'unresolved',
      facts,
      overrides,
      provenance: {
        kind: 'existing-feature-split',
        ...(facts.location.address.authored
          ? { addressParserVersion: ADDRESS_PARSER_VERSION }
          : {}),
        originalAddress: structuredClone(baseline.address),
        legacyPropertyIds: [...baseline.legacyPropertyIds].sort(),
      },
    },
  }
}
