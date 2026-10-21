// DOMAIN
import { AvailableDiscoveryTypeSchema, type AvailableDiscoveryType } from './kinds'

export type LocationCandidatePage<T> = {
  rows: T[]
  partial: boolean
  limited: boolean
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
