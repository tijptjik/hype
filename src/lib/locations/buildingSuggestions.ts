// SOURCES
import {
  loadBuildingNames,
  loadBuildingPoints,
  loadBuildingDetails,
} from '#lib/sources/saanseoi.js'
// ADDRESS
import { loadAddressNames } from '#lib/addresses/nameCatalogue.js'
import { buildingNames } from '#lib/addresses/buildingNames.js'
import { fillBuildingDetails } from '#lib/addresses/buildingSelection.js'
import {
  emptyFeatureAddress,
  getAddressLocale,
  ADDRESS_LOCALES,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import { localAddressContent } from '#lib/addresses/locationDraft.js'
import { normalizeNameSearch } from '#lib/addresses/nameSearch.js'
// DOMAIN
import {
  containsBuildingPoint,
  type SelectedBuilding,
} from '#lib/map/buildingAddress.js'
import { locationDistance } from './searchPresentation'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type { LocaleKey } from '#lib/types.js'
import type { BuildingSearchResult } from './buildingSearch'

/** Compare canonical address identity or complete street-and-number evidence, excluding unit details.
 * @param address Feature placement. @param candidate Published building address alternative.
 * @returns Whether the building carries the same address; proximity alone never establishes a match.
 */
export function buildingHasAddress(
  address: FeatureAddress,
  candidate: BuildingSearchResult,
): boolean {
  const addressEdited = Object.values(address.overrides).some(row =>
    Object.keys(row).some(
      key => key === 'streetName' || key.startsWith('buildingNumber'),
    ),
  )
  if (
    !addressEdited &&
    address.source.address2dId &&
    candidate.buildingSource.addressId === address.source.address2dId
  )
    return true
  return Object.keys(ADDRESS_LOCALES).some(key => {
    const a = getAddressLocale(address, key as LocaleKey)
    const b = getAddressLocale(candidate.address, key as LocaleKey)
    const street = normalizeNameSearch(String(a.streetName ?? ''))
    const number = normalizeNameSearch(
      String(a.buildingNumberExpression ?? a.buildingNumberFrom ?? ''),
    )
    return Boolean(
      street &&
        number &&
        street === normalizeNameSearch(String(b.streetName ?? '')) &&
        number ===
          normalizeNameSearch(
            String(b.buildingNumberExpression ?? b.buildingNumberFrom ?? ''),
          ),
    )
  })
}

/** Resolve address suggestions and unnamed buildings within the discovery radius or selected footprint.
 * @param address Current placement. @param locale Display locale. @param isCurrent Stale request guard.
 * @param footprint Optional selected building area; restricts discovery to its complete extent instead of a pin radius.
 * @returns Exact address matches first, otherwise the complete radius or footprint result, pinned to one export release.
 * @remarks Without a footprint, the cached point index bounds address matching to 100 metres and fallback to 50 metres. A selected footprint replaces both radius limits. Detail reads are batched eight at a time.
 */
export async function suggestAddressBuildings(
  address: FeatureAddress,
  locale: LocaleKey,
  isCurrent: () => boolean,
  footprint?: SelectedBuilding['geometry'],
): Promise<{ rows: BuildingSearchResult[]; exact: boolean }> {
  const coordinates = address.coordinates
  const [inventory, streets] = await Promise.all([
    loadBuildingNames(),
    loadAddressNames('streets'),
  ])
  if (!isCurrent()) return { rows: [], exact: false }
  if (!coordinates) return { rows: [], exact: false }
  // Join nearby detail shards only: avoid downloading the full address export for every picker.
  const points = await loadBuildingPoints(inventory.release)
  const nearby = points
    .filter(point =>
      footprint
        ? containsBuildingPoint(point.coordinates, footprint)
        : locationDistance(coordinates, point.coordinates) <= 100,
    )
    .sort(
      (a, b) =>
        locationDistance(coordinates, a.coordinates) -
        locationDistance(coordinates, b.coordinates),
    )
  const names = new Map(inventory.records.map(row => [row.id, row]))
  const all: BuildingSearchResult[] = []
  for (let offset = 0; offset < nearby.length && isCurrent(); offset += 8) {
    const groups = await Promise.all(
      nearby.slice(offset, offset + 8).map(async point => {
        const details = await loadBuildingDetails(point.id, inventory.release)
        const named = names.get(point.id)
        const labels = buildingNames(named?.names ?? {}, named?.name)
        return (details.addresses.length ? details.addresses : [undefined]).map(
          candidate => {
            const projected = fillBuildingDetails(
              emptyFeatureAddress(),
              {
                id: point.id,
                name: named?.name ?? '',
                names: labels,
                divisionCodes: [],
              },
              details,
              candidate,
              false,
              locale,
              streets,
            )
            const display = getAddressDisplay(projected, locale)
            return {
              id: `building:${point.id}:${candidate?.id ?? ''}`,
              kind: 'building' as const,
              names: Object.keys(labels).length ? labels : { en: display || point.id },
              address: {
                ...projected,
                source: {
                  ...projected.source,
                  authored: localAddressContent(projected),
                },
                overrides: {},
              },
              buildingSource: {
                id: point.id,
                release: inventory.release,
                ...(candidate ? { addressId: candidate.id } : {}),
              },
            }
          },
        )
      }),
    )
    all.push(...groups.flat())
  }
  const exact = all.filter(row => buildingHasAddress(address, row))
  const withinRadius = all.filter(
    row =>
      row.address.coordinates &&
      (footprint
        ? containsBuildingPoint(row.address.coordinates, footprint)
        : locationDistance(coordinates, row.address.coordinates) <= 50),
  )
  // Keep one address alternative per physical building, preferring an exact address.
  const rows = [
    ...new Map(
      (exact.length ? exact : withinRadius).map(row => [row.buildingSource.id, row]),
    ).values(),
  ]
  return { rows, exact: exact.length > 0 }
}
