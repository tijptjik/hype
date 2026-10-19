import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
// SERVICES
import { geocodeAddress, type GeocodeOptions } from './geocoding.js'
import {
  containsBuildingPoint,
  type SelectedBuilding,
} from '#lib/map/buildingAddress.js'
// TYPES
import type { ParsedReverseGeocodeResult } from '#lib/utils/geocoding.types.js'
import type { LocaleKey } from '#lib/types.js'

/** Reads a non-empty source tag. @param building Selected footprint. @param keys Ordered field names. @returns Source text. */
function tag(building: SelectedBuilding, ...keys: string[]): string {
  for (const key of keys) {
    const value = building.properties[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/** Resolves a pin using its selected building before ALS. @param pin Selected location. @param building Containing footprint. @param options Request transport. @returns Address with evidence, or null when unresolved. @remarks Never substitutes an adjacent building's nearest point for a selected footprint. */
export async function geocodeBuilding(
  pin: { lng: number; lat: number },
  building: SelectedBuilding | null,
  options: GeocodeOptions = {},
): Promise<ParsedReverseGeocodeResult | null> {
  if (!building) return geocodeAddress(pin, options)
  if (!containsBuildingPoint([pin.lng, pin.lat], building.geometry))
    throw new Error('Selected building does not contain the pin')
  const number = tag(building, 'addr_housenumber')
  const full = tag(building, 'addr_full')
  const street = tag(building, 'addr_street', 'addr_street_en', 'addr_street_zh')
  const identity = { buildingSourceId: building.id, buildingSource: building.source }
  if (full || (number && street)) {
    const i18n = {} as ParsedReverseGeocodeResult['i18n']
    for (const locale of ['en', 'zhHant', 'zhHans'] as LocaleKey[]) {
      // Use supplied locale text, with verbatim source text as fallback; never invent a translation.
      const localStreet =
        tag(building, locale === 'en' ? 'addr_street_en' : 'addr_street_zh') || street
      const name = tag(building, locale === 'en' ? 'name_en' : 'name_zh', 'name')
      const label =
        full || [name, `${number} ${localStreet}`].filter(Boolean).join(', ')
      i18n[locale] = {
        displayAddress: label,
        displayAddressGen: true,
        addressProperties: {},
      }
    }
    const address = emptyFeatureAddress(
      Object.fromEntries(
        Object.entries(i18n).map(([locale, value]) => [
          locale === 'zhHant' ? 'zh-hant' : locale === 'zhHans' ? 'zh-hans' : locale,
          value.displayAddress ?? '',
        ]),
      ),
    )
    address.coordinates = [pin.lng, pin.lat]
    address.legacy = { building: { ...identity, properties: building.properties } }
    return {
      i18n,
      addressMeta: {
        address,
        ...identity,
        longitude: pin.lng,
        latitude: pin.lat,
        addressReverseGeocoder: 'saanseoi_basemap',
        addressReverseGen: true,
        addressMatch: 'building_address',
      },
    }
  }
  const result = await geocodeAddress(pin, { ...options, footprint: building.geometry })
  if (!result) return null
  result.addressMeta = {
    ...result.addressMeta,
    ...identity,
    addressMatch: 'within_footprint',
  }
  return result
}
