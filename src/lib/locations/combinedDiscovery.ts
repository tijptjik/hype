// DOMAIN
import { AvailableDiscoveryTypeSchema, type AvailableDiscoveryType } from './kinds'
import {
  locationDiscoveryTypes,
  type LocationDiscoveryType,
  type LocationKind,
} from './kinds'

export type LocationCandidatePage<T> = {
  rows: T[]
  partial: boolean
  limited: boolean
}

/** Discover the families appropriate to an authored type, preserving missing adapters as a coverage gap.
 * @param kind Authored entity type. @param providers Available preview adapters.
 * @returns Successful previews, failed families and explicit incomplete/truncated coverage.
 * @remarks An unavailable family never silently becomes an empty successful search.
 */
export async function discoverLocationKind<T>(
  kind: LocationKind,
  providers: Partial<
    Record<LocationDiscoveryType, () => Promise<LocationCandidatePage<T>>>
  >,
): Promise<LocationCandidatePage<T> & { unavailable: LocationDiscoveryType[] }> {
  const families = locationDiscoveryTypes(kind)
  const settled = await Promise.allSettled(
    families.map(async family => {
      const provider = providers[family]
      if (!provider) throw new Error('LOCATION_FAMILY_UNAVAILABLE')
      return provider()
    }),
  )
  const result: LocationCandidatePage<T> & { unavailable: LocationDiscoveryType[] } = {
    rows: [],
    partial: false,
    limited: false,
    unavailable: [],
  }
  settled.forEach((item, index) => {
    if (item.status === 'rejected') {
      result.partial = true
      result.unavailable.push(families[index])
    } else {
      result.rows.push(...item.value.rows)
      result.partial ||= item.value.partial
      result.limited ||= item.value.limited
    }
  })
  return result
}

/** Search only supported selected families, retaining successful results if another fails.
 * @param types Enabled discovery types; unsupported values fail before any request.
 * @param providers Family-specific bounded discovery adapters.
 * @returns Combined previews and explicit partial/truncated coverage, never an identity match.
 */
export async function discoverLocations<T>(
  types: readonly AvailableDiscoveryType[],
  providers: Record<AvailableDiscoveryType, () => Promise<LocationCandidatePage<T>>>,
): Promise<LocationCandidatePage<T>> {
  const selected = [
    ...new Set(types.map(type => AvailableDiscoveryTypeSchema.parse(type))),
  ]
  const results = await Promise.allSettled(selected.map(type => providers[type]()))
  return results.reduce<LocationCandidatePage<T>>(
    (combined, result) => {
      if (result.status === 'rejected') combined.partial = true
      else {
        combined.rows.push(...result.value.rows)
        combined.partial ||= result.value.partial
        combined.limited ||= result.value.limited
      }
      return combined
    },
    { rows: [], partial: false, limited: false },
  )
}
