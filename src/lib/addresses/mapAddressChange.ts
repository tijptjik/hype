// ADDRESS
import {
  ADDRESS_LOCALES,
  getAddressLocale,
  setAddressOverride,
  type FeatureAddress,
} from './featureAddress'
import { setAddressExpression } from './addressExpressions'
import { addressComponentValue } from './presentation'
import { applyAddressAbbreviations } from './formatting'
import { normalizeNameSearch } from './nameSearch'
import { localAddressContent, localAddressDraft } from './locationDraft'
import { formatStreetNumber } from './streetNumber.js'
// TYPES
import type { MapAddressDisagreement } from './mapAddressDisagreement'

/** Apply the displayed map differences without changing the retained source record.
 * @param address Current draft. @param conflicts Explicit differences accepted by the user.
 * @returns Corrected draft; coordinates and unrelated unit/direction edits are retained.
 */
export function applyMapAddressChange(
  address: FeatureAddress,
  conflicts: readonly MapAddressDisagreement[],
): FeatureAddress {
  for (const conflict of conflicts) {
    if (conflict.field === 'number') {
      address = setAddressExpression(
        address,
        'en',
        'buildingNumberExpression',
        conflict.mapped,
      )
      for (const locale of Object.keys(
        ADDRESS_LOCALES,
      ) as (keyof typeof ADDRESS_LOCALES)[])
        address = setAddressOverride(address, locale, 'formattedAddress', undefined)
      continue
    }
    const fields =
      conflict.field === 'building'
        ? (['buildingName', 'premisesName'] as const)
        : conflict.field === 'street'
          ? (['streetName'] as const)
          : (['blockExpression'] as const)
    // Map names belong only to the language they actually supply; never fabricate translations.
    for (const locale of Object.keys(
      ADDRESS_LOCALES,
    ) as (keyof typeof ADDRESS_LOCALES)[]) {
      for (const field of fields) {
        const value = addressComponentValue(address, locale, field)
        const selected =
          conflict.field === 'building'
            ? value
                .replace(
                  /\s+(?:Block|Tower|Building|House|Villa)\s+(?:[A-Z]|[IVX]{1,6}|\d+[A-Z]?)$/i,
                  '',
                )
                .trim()
            : value
        if (
          selected &&
          normalizeNameSearch(selected) === normalizeNameSearch(conflict.selected)
        ) {
          address = setAddressExpression(address, locale, field, conflict.mapped)
          address = setAddressOverride(address, locale, 'formattedAddress', undefined)
        }
      }
    }
  }
  return address
}

/** Compare complete structured address identities, preserving number/range and unit distinctions.
 * @param expected Accepted map corrections. @param candidate Published or locally stored address.
 * @returns True only when a meaningful localized address matches every populated component.
 * @remarks Names may differ only by standard street abbreviations and punctuation. Numbers
 * retain punctuation: 242, 242–244 and 242/244 must never become interchangeable.
 */
export function exactAddressChangeMatch(
  expected: FeatureAddress,
  candidate: FeatureAddress,
): boolean {
  const fields = [
    'premisesName',
    'buildingName',
    'blockExpression',
    'phaseExpression',
    'buildingNumberExpression',
    'streetName',
    'floorExpression',
    'unitExpression',
    'unitPortion',
  ] as const
  let matched = false
  for (const locale of Object.keys(
    ADDRESS_LOCALES,
  ) as (keyof typeof ADDRESS_LOCALES)[]) {
    const left = getAddressLocale(expected, locale),
      right = getAddressLocale(candidate, locale)
    if (!Object.values(left).some(Boolean) || !Object.values(right).some(Boolean))
      continue
    // A bare number or display-only fallback cannot establish an address identity.
    if (!(left.buildingName || left.premisesName || left.streetName)) continue
    for (const field of fields) {
      const a = addressComponentValue(expected, locale, field)
      const b = addressComponentValue(candidate, locale, field)
      const key = (value: string): string =>
        field === 'buildingNumberExpression'
          ? formatStreetNumber(value).toLowerCase().replace(/\s+/g, '')
          : ['floorExpression', 'unitExpression', 'unitPortion'].includes(field)
            ? value
                .normalize('NFKC')
                .toLowerCase()
                .replace(/[–—]/g, '-')
                .replace(/\s+/g, '')
            : normalizeNameSearch(applyAddressAbbreviations(value))
      if (key(a) !== key(b)) return false
    }
    matched = true
  }
  return matched
}

/** Detach an unmatched correction from canonical identity while retaining original evidence.
 * @param address Corrected draft. @returns Custom authored address at the current marker.
 */
export function customMapAddressChange(address: FeatureAddress): FeatureAddress {
  return {
    ...localAddressDraft(localAddressContent(address)),
    coordinates: address.coordinates,
    divisionOverrides: address.divisionOverrides,
    accessHints: address.accessHints,
    legacy: {
      ...address.legacy,
      previousAddressSource: address.source,
      previousCanonicalAddress: address.canonical,
    },
  }
}
