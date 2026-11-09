// ADDRESS
import {
  ADDRESS_LOCALES,
  getAddressDisplay,
  getAddressLocale,
  type FeatureAddress,
} from '#lib/addresses/featureAddress.js'
import { localAddressContent } from '#lib/addresses/locationDraft.js'
// VALIDATION
import { LocalLocationInputSchema, type LocalLocationInput } from './local.js'

/** Read building names without treating a premises or estate name as a building identity.
 * @param address Accepted address evidence.
 * @returns Available localized building names; no source identity is inferred.
 */
export function addressBuildingNames(address: FeatureAddress): Record<string, string> {
  return Object.fromEntries(
    Object.entries(ADDRESS_LOCALES).flatMap(([locale, tag]) => {
      const value = getAddressLocale(
        address,
        locale as keyof typeof ADDRESS_LOCALES,
      ).buildingName
      return typeof value === 'string' && value.trim() ? [[tag, value]] : []
    }),
  )
}

/** Label an address-only Location from its effective localized address, without inventing a venue name.
 * @param address Selected address including reviewed component and display corrections.
 * @returns Nonempty address labels keyed by publisher locale tags.
 */
export function addressLocationNames(address: FeatureAddress): Record<string, string> {
  return Object.fromEntries(
    Object.entries(ADDRESS_LOCALES).flatMap(([locale, tag]) => {
      const label = getAddressDisplay(
        address,
        locale as keyof typeof ADDRESS_LOCALES,
      ).trim()
      return label ? [[tag, label]] : []
    }),
  )
}

/** Prepare a local entity with explicitly selected visibility using selected address components.
 * @param kind Explicitly chosen entity kind. @param names Reviewed entity names.
 * @param address Selected address with its effective local corrections.
 * @param visibility Whether other organisations can use this identity.
 * @returns Local facts without fabricated upstream identity; the Feature retains its address reference.
 * @remarks Address-kind names derive from the reviewed address. Canonical references remain
 * in the Feature's accepted placement; local creation does not verify upstream publication.
 */
export function localIdentityFromAddress(
  kind: 'address' | 'premises' | 'building' | 'establishment',
  names: Record<string, string>,
  address: FeatureAddress,
  visibility: 'shared' | 'exclusive' = 'shared',
): LocalLocationInput {
  if (!address.coordinates) throw new Error('A Location requires coordinates')
  const content = localAddressContent(address)
  return LocalLocationInputSchema.parse({
    kind,
    state: visibility === 'exclusive' ? 'manual' : 'unresolved',
    sharingPreference: 'private',
    facts: {
      names: kind === 'address' ? addressLocationNames(address) : names,
      phoneNumber: [],
      brands: [],
      location: {
        geometry: { type: 'Point', coordinates: address.coordinates },
        address: {
          status: 'unresolved',
          address2dId: null,
          address3dId: null,
          address3dUnitId: null,
          snapshotId: null,
          rawSource: {},
          fallbackDisplay: {},
          authored:
            kind === 'building' ? { ...content, unit: null, unitI18n: {} } : content,
        },
      },
    },
  })
}
