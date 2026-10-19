// PROPERTIES
import {
  presentationProperty,
  type PresentationFeature,
} from './presentationProperties'

/** Brand labels and restrained accents; badges are text, not fabricated official logos. */
const BRANDS = [
  { match: /maxim|美心/i, name: 'Maxim’s', badge: '美心', color: '#b43633' },
  { match: /arome|東海堂/i, name: 'arôme', badge: 'a', color: '#7c493c' },
  { match: /7.?eleven|7.?11/i, name: '7-Eleven', badge: '7', color: '#087c56' },
  { match: /honor|聖安娜/i, name: 'Saint Honore', badge: 'SH', color: '#8c394a' },
  { match: /yamazaki|山崎/i, name: 'Yamazaki', badge: 'Y', color: '#a82932' },
  { match: /kayser/i, name: 'Maison Kayser', badge: 'MK', color: '#65452d' },
] as const

/**
 * Resolves brand identity from the canonical brand property.
 * @param feature Hydrated feature.
 * @returns Text badge and accent, with a neutral independent-shop fallback.
 */
export function breadlineBrand(feature: PresentationFeature): {
  name: string
  badge: string
  color: string
} {
  const name = presentationProperty(feature, 'brand')
  const known = BRANDS.find(brand => brand.match.test(name))
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
