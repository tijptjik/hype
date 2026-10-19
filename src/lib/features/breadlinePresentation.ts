// PROPERTIES
import {
  presentationProperty,
  type PresentationFeature,
} from './presentationProperties'

// BRAND CATALOGUE
import { resolveBrandIdentity } from './brandIdentity'

/**
 * Resolves brand identity from the canonical brand property.
 * @param feature Hydrated feature.
 * @returns Bundled logo, text fallback and accent from the effective brand property.
 */
export function breadlineBrand(feature: PresentationFeature): {
  name: string
  badge: string
  color: string
  logoSrc?: string
} {
  const name = presentationProperty(feature, 'brand')
  const known = resolveBrandIdentity(name)
  return (
    known ?? {
      name: name || 'Breadline',
      badge: name ? name.slice(0, 2).toUpperCase() : 'B',
      color: '#3b7263',
    }
  )
}

/** Date-scoped data supplied by a run adapter; absent data is never fabricated. */
export type BreadlineMarkerState = {
  yield: 'high' | 'medium' | 'low' | 'none' | 'unknown'
  source: 'reported' | 'estimated'
  claimed: boolean
  dropoff?: boolean
}

/**
 * Resolves marker semantics from a live run state or explicitly named properties.
 * @param feature Feature property data.
 * @param state Date-scoped operational state supplied by the caller.
 * @returns Neutral unknown state when no availability data exists.
 */
export function breadlineMarkerState(
  feature: PresentationFeature,
  state?: BreadlineMarkerState,
): BreadlineMarkerState {
  if (state) return state
  const tier = presentationProperty(feature, 'yieldTier')
  return {
    yield:
      tier === 'high' || tier === 'medium' || tier === 'low' || tier === 'none'
        ? tier
        : 'unknown',
    source:
      presentationProperty(feature, 'expectedSource') === 'reported'
        ? 'reported'
        : 'estimated',
    claimed: presentationProperty(feature, 'claimed') === 'true',
    // The canonical Breadline destination layer also identifies imported drop-offs.
    dropoff:
      feature.layerId === 'kin0shUTfrUi' ||
      presentationProperty(feature, 'breadlineRole') === 'dropoff',
  }
}
