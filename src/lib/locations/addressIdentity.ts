// ADDRESS
import {
  ADDRESS_LOCALES,
  emptyFeatureAddress,
  getAddressDisplay,
  getAddressLocale,
  type FeatureAddress,
} from '#lib/addresses/featureAddress.js'
import {
  localAddressContent,
  localAddressDisplayOverrides,
} from '#lib/addresses/locationDraft.js'
import { normalizeContentLocale } from '#lib/content-locales/model.js'
import { contentStorageTag } from '#lib/i18n/contentRecords.js'
// VALIDATION
import { LocalLocationInputSchema, type LocalLocationInput } from './local.js'
// TYPES
import type { LocationResource } from './resource'

/** Read building names without treating a premises or estate name as a building identity.
 * @param address Accepted address evidence.
 * @param explicitNames Reviewed Location names, including deliberate clears in the current draft.
 * @returns Available localized building names; no source identity is inferred.
 */
export function addressBuildingNames(
  address: FeatureAddress,
  explicitNames: Record<string, string> = {},
): Record<string, string> {
  const names = { ...explicitNames }
  for (const [locale, tag] of Object.entries(ADDRESS_LOCALES)) {
    if (Object.hasOwn(names, tag)) continue
    const value = getAddressLocale(
      address,
      locale as keyof typeof ADDRESS_LOCALES,
    ).buildingName
    if (typeof value === 'string' && value.trim()) names[tag] = value
  }
  // Additional authored languages have exact component rows and locale-specific overrides.
  const content =
    address.association?.content ??
    address.canonical?.content ??
    address.source.canonical?.content ??
    address.source.authored
  const rows = content?.i18n ?? {}
  for (const tag of new Set([
    ...Object.keys(rows),
    ...Object.keys(address.overrides),
  ])) {
    const locale = normalizeContentLocale(tag)
    if (!locale) continue
    const key = contentStorageTag(locale)
    if (
      Object.hasOwn(names, key) ||
      Object.values(ADDRESS_LOCALES).some(tag => tag === key)
    )
      continue
    const changes = address.overrides[tag.toLowerCase()]
    const value =
      changes && Object.hasOwn(changes, 'buildingName')
        ? changes.buildingName
        : rows[tag]?.buildingName
    if (typeof value === 'string' && value.trim()) names[key] = value
  }
  return names
}

/** Read the standalone building profile, including address names saved before profile autofill.
 * @param place Location and its community or private profile.
 * @returns Recorded translations with available building names in missing languages.
 */
export function buildingProfileNames(
  place: Pick<LocationResource, 'state' | 'facts' | 'sharedFacts' | 'communityLocks'>,
): Record<string, string> {
  const community = place.state === 'linked' || place.state === 'unresolved'
  const facts = community ? (place.sharedFacts ?? place.facts) : place.facts
  if (!facts) return {}
  if (
    facts.confirmedUnnamed ||
    (community && place.communityLocks?.openFields.names === false)
  )
    return facts.names
  return addressBuildingNames(
    { ...emptyFeatureAddress(), source: facts.location.address },
    facts.names,
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
  kind:
    | 'address'
    | 'premises'
    | 'building'
    | 'building_part'
    | 'infrastructure'
    | 'built'
    | 'structure'
    | 'landform'
    | 'coastal_feature'
    | 'water_feature'
    | 'service_point'
    | 'street'
    | 'natural'
    | 'establishment',
  names: Record<string, string>,
  address: FeatureAddress,
  visibility: 'shared' | 'exclusive' = 'shared',
): LocalLocationInput {
  if (!address.coordinates) throw new Error('A Location requires coordinates')
  const content = localAddressContent(address)
  return LocalLocationInputSchema.parse({
    kind,
    operatesInLocationId: address.association?.operatesInLocationId,
    ...(kind === 'building_part'
      ? {
          buildingId: address.association?.buildingId,
          parentPartId: address.association?.parentPartId,
        }
      : {}),
    state: visibility === 'exclusive' ? 'manual' : 'unresolved',
    sharingPreference: 'private',
    facts: {
      names:
        kind === 'address'
          ? addressLocationNames(address)
          : kind === 'building'
            ? addressBuildingNames(
                address,
                Object.fromEntries(
                  Object.entries(names).filter(([, name]) => name.trim()),
                ),
              )
            : names,
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
          displayOverrides: localAddressDisplayOverrides(address),
          authored:
            kind === 'building' ? { ...content, unit: null, unitI18n: {} } : content,
        },
      },
    },
  })
}
