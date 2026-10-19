// PROPERTIES
import {
  presentationProperty,
  type PresentationFeature,
} from './presentationProperties'

// BRAND CATALOGUE
import { resolveBrandIdentity } from './brandIdentity'

/**
 * Resolves accepted Place brands, with legacy fallback only for unassociated Features.
 * @param feature Hydrated feature.
 * @param locale Preferred display locale; all brands are retained.
 * @returns Bundled logo for a single known brand, or combined names for multiple brands.
 */
export function breadlineBrand(
  feature: PresentationFeature,
  locale = 'en',
): {
  name: string
  badge: string
  color: string
  logoSrc?: string
} {
  if (feature.placeBrands != null) {
    const names = feature.placeBrands
      .map(
        brand =>
          brand.names[locale] ||
          brand.names.en ||
          Object.values(brand.names).find(Boolean) ||
          '',
      )
      .filter(Boolean)
    const name = names.join(' · ')
    const single = feature.placeBrands.length === 1 ? feature.placeBrands[0] : null
    const known = single
      ? resolveBrandIdentity(
          single.identifiers.breadlineBrand || single.names.en || name,
        )
      : undefined
    return known
      ? { ...known, name: name || known.name }
      : {
          name: name || 'Breadline',
          badge: name ? name.slice(0, 2).toUpperCase() : 'B',
          color: '#3b7263',
        }
  }
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
