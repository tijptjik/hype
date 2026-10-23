// VALIDATION
import { z } from 'zod'
import { loadStreetCatalogue, MOCK_STREET_CATALOGUE_MANIFEST } from './streetCatalogue'
// ADDRESS
import { ADDRESS_LOCALES, getAddressLocale, setAddressOverride } from './featureAddress'
import { prepareLocalLocationAddress } from './locationDraft'
// TYPES
import type { FeatureAddress } from './featureAddress'

export const AddressNameSchema = z.object({
  id: z.string().min(1),
  names: z.record(z.string(), z.string()),
  divisionCodes: z.array(z.string()),
})
export type AddressName = z.infer<typeof AddressNameSchema>
const cache = new Map<string, Promise<AddressName[]>>()

/** Load the temporary names projection; failed requests remain retryable.
 * @param family Controlled vocabulary to retrieve.
 * @returns Validated names; fixture IDs are never persisted as canonical address IDs.
 */
export function loadAddressNames(
  family: 'streets' | 'buildings',
): Promise<AddressName[]> {
  let pending = cache.get(family)
  if (!pending) {
    pending = (
      family === 'streets'
        ? loadStreetCatalogue(
            new URL(MOCK_STREET_CATALOGUE_MANIFEST, window.location.origin),
          ).then(catalogue => catalogue.streets)
        : fetch(`/mocks/saanseoi/${family}/names/data.json`).then(async response => {
            if (!response.ok) throw new Error(`Names unavailable (${response.status})`)
            return z.array(AddressNameSchema).parse(await response.json())
          })
    ).catch(error => {
      cache.delete(family)
      throw error
    })
    cache.set(family, pending)
  }
  return pending
}

/** Apply all published translations together without fabricating missing translations.
 * @param address Current draft. @param field Controlled name field.
 * @param record Explicitly chosen record, or null to clear the name.
 * @returns Draft corrections; source evidence and identity remain untouched.
 */
export function setAddressName(
  address: FeatureAddress,
  field: 'streetName' | 'buildingName',
  record: AddressName | null,
): FeatureAddress {
  for (const [locale, tag] of Object.entries(ADDRESS_LOCALES)) {
    const value = Object.entries(record?.names ?? {}).find(
      ([key]) => key.toLowerCase() === tag.toLowerCase(),
    )?.[1]
    address = setAddressOverride(
      address,
      locale as keyof typeof ADDRESS_LOCALES,
      field,
      value ?? null,
    )
  }
  return address
}

/** Parse an unassociated Place address, accepting English streets only from the catalogue.
 * @param address Selected preview, with original text retained as evidence.
 * @param streets Controlled street vocabulary.
 * @returns A local structured draft; never an invented canonical address association.
 */
export function structurePlaceAddress(
  address: FeatureAddress,
  streets: AddressName[],
): FeatureAddress {
  if (address.source.address2dId || address.source.authored) return address
  const content = prepareLocalLocationAddress(address)
  const english = address.source.fallbackDisplay.en?.trim() ?? ''
  const match = /^(\d+[A-Za-z]?(?:\s*[-–]\s*\d+[A-Za-z]?)?)\s+(.+)$/.exec(english)
  const street =
    match && streets.find(row => row.names.en?.toLowerCase() === match[2].toLowerCase())
  if (match && street) {
    const [from, to] = match[1].split(/\s*[-–]\s*/)
    content.i18n.en = {
      ...content.i18n.en,
      formattedAddress: '',
      streetName: street.names.en,
      buildingNumberFrom: from,
      buildingNumberTo: to ?? null,
      buildingNumberConnector: to ? '-' : null,
      buildingNumberExpression: match[1],
    }
    content.granularity = 'building'
  }
  // Do not install an unstructured parser result merely to replace identical source text.
  if (
    !Object.values(content.i18n).some(
      row => row.streetName || row.buildingName || row.premisesName,
    )
  )
    return address
  const next = { ...address, source: { ...address.source, authored: content } }
  // A structured correction lets display composition use the parsed components.
  for (const locale of Object.keys(ADDRESS_LOCALES) as Array<
    keyof typeof ADDRESS_LOCALES
  >) {
    const row = getAddressLocale(next, locale)
    if (row.streetName) {
      next.overrides = setAddressOverride(
        next,
        locale,
        'streetName',
        row.streetName,
      ).overrides
    }
  }
  return next
}
