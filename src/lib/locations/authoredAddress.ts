// ADDRESS CONTRACT
import { parseAddressContent } from '@saanseoi/address'
// TYPES
import type { LocationFacts } from './model'
import type { SaanSeoiPlaceProjection } from './saanseoi'

/** Carry HYPE-authored address content independently of canonical Location identity.
 * @param projection New immutable source evidence.
 * @param retained Previous Location facts and provenance.
 * @param seedLocal Whether a reviewed local-to-source identity transition should parse retained text.
 * @returns Source projection with a separate effective local address and its provenance.
 * @remarks Never edits the retained source resource or retires local content because an
 * upstream address appeared. That reconciliation requires a separate accepted receipt.
 */
export function retainAuthoredAddress(
  projection: SaanSeoiPlaceProjection,
  retained?: { facts: LocationFacts; rawSource: Record<string, unknown> } | null,
  seedLocal = false,
): SaanSeoiPlaceProjection {
  if (!retained) return projection
  const old = retained.facts.location.address
  const parsed =
    !old.authored && seedLocal && Object.values(old.fallbackDisplay).some(Boolean)
      ? parseAddressContent(old.fallbackDisplay)
      : null
  const authored = old.authored ?? parsed?.content
  if (!authored) return projection
  const localAddress = retained.rawSource.localAddress ?? {
    kind: parsed ? 'parsed-local-baseline' : 'retained-local-address',
    ...(parsed
      ? {
          parserVersion: parsed.parserVersion,
          source: parsed.source,
          unresolved: parsed.unresolved,
          diagnostics: parsed.diagnostics,
          review: 'required',
        }
      : {}),
  }
  return {
    ...projection,
    rawSource: {
      ...projection.rawSource,
      sourceAddress:
        projection.rawSource.sourceAddress ?? projection.facts.location.address,
      localAddress,
    },
    facts: {
      ...projection.facts,
      location: {
        ...projection.facts.location,
        address: {
          status: 'unresolved',
          address2dId: null,
          address3dId: null,
          address3dUnitId: null,
          snapshotId: null,
          rawSource: {},
          fallbackDisplay: { ...old.fallbackDisplay },
          ...(old.displayOverrides
            ? { displayOverrides: { ...old.displayOverrides } }
            : {}),
          authored,
        },
      },
    },
  }
}
