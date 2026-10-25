// SOURCES
import { loadBuildingNames, loadBuildingDetails } from '#lib/sources/saanseoi.js'
// ADDRESS
import { normalizeNameSearch } from '#lib/addresses/nameSearch.js'
import { loadAddressNames } from '#lib/addresses/nameCatalogue.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { fillBuildingDetails } from '#lib/addresses/buildingSelection.js'
// TYPES
import type { LocaleKey } from '#lib/types.js'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'

export type BuildingSearchResult = {
  id: string
  kind: 'building'
  names: Record<string, string>
  address: FeatureAddress
}
/** Match names locally, then join only the matching buildings' release-pinned shards.
 * @param query Name text, in any published language.
 * @param locale Current editor language.
 * @param isCurrent Guard against fetching details for superseded queries.
 * @returns At most ten buildings, with each spatial address alternative kept explicit.
 * @remarks No nearest-address guess or canonical association is created.
 */
export async function searchBuildingNames(
  query: string,
  locale: LocaleKey,
  isCurrent: () => boolean = () => true,
): Promise<BuildingSearchResult[]> {
  const [bundle, streets] = await Promise.all([
    loadBuildingNames(),
    loadAddressNames('streets').catch(() => []),
  ])
  if (!isCurrent()) return []
  const needle = normalizeNameSearch(query)
  if (!needle) return []
  const matches = bundle.records
    .filter(row =>
      [row.name, ...Object.values(row.names)].some(name =>
        name && normalizeNameSearch(name).includes(needle),
      ),
    )
    .slice(0, 10)
  const groups = await Promise.all(
    matches.map(async row => {
      if (!isCurrent()) return []
      const details = await loadBuildingDetails(row.id, bundle.release)
      if (!isCurrent()) return []
      const names = Object.fromEntries(
        Object.entries(row.names).filter((entry): entry is [string, string] =>
          Boolean(entry[1]),
        ),
      )
      const building = { ...row, names, release: bundle.release }
      const candidates = details.addresses.length ? details.addresses : [undefined]
      return candidates.map(candidate => ({
        id: `building:${row.id}:${candidate ? `${candidate.id}:${candidate.snapshotId}` : ''}`,
        kind: 'building' as const,
        names: { ...names, ...(row.name ? { und: row.name } : {}) },
        address: fillBuildingDetails(
          emptyFeatureAddress(),
          building,
          details,
          candidate,
          false,
          locale,
          streets,
        ),
      }))
    }),
  )
  return groups.flat()
}
