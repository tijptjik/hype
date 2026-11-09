// ADDRESS
import { addressBuildingNames } from './addressIdentity'
import { normalizeNameSearch } from '#lib/addresses/nameSearch.js'
// DISCOVERY
import { searchBuildingNames } from './buildingSearch'
import { locationDistance } from './searchPresentation'
// TYPES
import type { DraftLocationSearchResult } from '#lib/bits/patterns/forms/featureLocation/draftLocationSearch.types.js'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type { LocaleKey } from '#lib/types.js'

/** Filter only nearby exact-name building evidence, independently of provider order.
 * @param address Current address marker.
 * @param rows Discovery previews.
 * @param names Building names.
 * @returns Distance-sorted candidates; an empty name set never matches a premises.
 */
function nearbyBuildingCandidates(
  address: FeatureAddress,
  rows: DraftLocationSearchResult[],
  names: Record<string, string>,
): DraftLocationSearchResult[] {
  if (!address.coordinates) return []
  const needles = new Set(Object.values(names).map(normalizeNameSearch).filter(Boolean))
  return rows
    .filter(
      row =>
        row.kind === 'building' &&
        !row.localKind &&
        row.address.coordinates &&
        Object.values(row.names).some(name => needles.has(normalizeNameSearch(name))) &&
        locationDistance(address.coordinates!, row.address.coordinates) <= 100,
    )
    .toSorted(
      (a, b) =>
        locationDistance(address.coordinates!, a.address.coordinates!) -
        locationDistance(address.coordinates!, b.address.coordinates!),
    )
}

/** Match an exact published building name within the address's 100 metre neighbourhood.
 * @param address Address evidence and its marker, including an optional canonical Address ID.
 * @param rows Previously discovered buildings; establishments never supply building identity.
 * @param names Explicit identity names, otherwise the address's building component.
 * @returns Nearest unambiguous building, favouring its matching spatial address alternative.
 * @remarks Equal-distance distinct buildings remain unresolved; premises names are not building names.
 */
export function matchAddressBuilding(
  address: FeatureAddress,
  rows: DraftLocationSearchResult[],
  names = addressBuildingNames(address),
): DraftLocationSearchResult | null {
  if (!address.coordinates) return null
  const candidates = nearbyBuildingCandidates(address, rows, names)
  const nearest = candidates[0]
  if (!nearest) return null
  const samePoint = candidates.filter(row =>
    row.address.coordinates!.every(
      (coordinate, index) => coordinate === nearest.address.coordinates![index],
    ),
  )
  const identity = (row: DraftLocationSearchResult): string =>
    row.buildingSource?.id ?? row.id.split(':').slice(0, 2).join(':')
  if (new Set(samePoint.map(identity)).size > 1) return null
  const nextBuilding = candidates.find(row => identity(row) !== identity(nearest))
  if (
    nextBuilding &&
    Math.abs(
      locationDistance(address.coordinates, nextBuilding.address.coordinates!) -
        locationDistance(address.coordinates, nearest.address.coordinates!),
    ) < 0.01
  )
    return null
  return (
    samePoint.find(
      row => row.buildingSource?.addressId === address.source.address2dId,
    ) ?? nearest
  )
}

/** Resolve a building hidden by discovery limits or listed under another address.
 * @param address Current address marker and structured building component.
 * @param rows Cached discovery results, searched before making another lookup.
 * @param locale Active editor language.
 * @param isCurrent Reject responses after an edit, selection change or navigation.
 * @param names Optional explicitly edited building identity names.
 * @returns A nearby exact-name building target, without changing the draft or marker.
 */
export async function resolveAddressBuilding(
  address: FeatureAddress,
  rows: DraftLocationSearchResult[],
  locale: LocaleKey,
  isCurrent: () => boolean,
  names = addressBuildingNames(address),
): Promise<DraftLocationSearchResult | null> {
  const existing = matchAddressBuilding(address, rows, names)
  if (existing) return existing
  if (nearbyBuildingCandidates(address, rows, names).length)
    throw new Error('BUILDING_MATCH_AMBIGUOUS')
  if (!address.coordinates) return null
  const queries = [
    ...new Set(
      Object.values(names)
        .map(name => name.trim())
        .filter(Boolean),
    ),
  ]
  const found: DraftLocationSearchResult[] = []
  for (const query of queries) {
    if (!isCurrent()) return null
    found.push(
      ...(await searchBuildingNames(query, locale, isCurrent, {
        exact: true,
        coordinates: address.coordinates,
        maxDistance: 100,
      })),
    )
  }
  if (!isCurrent()) return null
  const target = matchAddressBuilding(address, found, names)
  if (!target && nearbyBuildingCandidates(address, found, names).length)
    throw new Error('BUILDING_MATCH_AMBIGUOUS')
  return target
}
