// TYPES
import type { LocaleKey } from '#lib/types.js'

// Common address abbreviations
export const addressAbbreviations = {
  Road: 'Rd',
  Street: 'St',
  Lane: 'Ln',
  Drive: 'Dr',
  Avenue: 'Ave',
  Place: 'Pl',
  Court: 'Ct',
  Close: 'Cl',
  Crescent: 'Cres',
  Gardens: 'Gdns',
  Heights: 'Hts',
  Mansion: 'Mans',
  House: 'Hse',
  Building: 'Bldg',
  Tower: 'Twr',
  Apartment: 'Apt',
  Quarters: 'Qtrs',
  Garage: 'Gar',
  Carpark: 'CP',
  Office: 'Off',
  Stage: 'Stg',
  Centre: 'Ctr',
  Center: 'Ctr',
  Complex: 'Complex',
  Estate: 'Estate',
  Village: 'Village',
  Phase: 'Ph',
  Block: 'Blk',
  Floor: 'F',
  Room: 'Rm',
  Unit: 'Unit',
  Flat: 'Flat',
  Shop: 'Shop',
  Suite: 'St',
}

/** Apply the canonical address abbreviation table.
 * @param address Display text. @returns Abbreviated display text; source evidence is not modified.
 */
export function applyAddressAbbreviations(address: string): string {
  // Apply abbreviations
  Object.entries(addressAbbreviations).forEach(([full, abbrev]) => {
    const regex = new RegExp(`\\b${full}\\b`, 'gi')
    address = address.replace(regex, abbrev)
  })
  return address
}

/** Title-case English street labels without changing Chinese text or source records.
 * @param value Published or edited street name. @param locale Display language.
 * @returns Consistent title case, retaining initials, numeric suffixes and apostrophes.
 */
export function streetDisplayName(value: string, locale: LocaleKey): string {
  if (locale !== 'en') return value
  return value.replace(/[A-Za-z]+(?:['’][A-Za-z]+)*/g, (word, offset: number) => {
    if (offset > 0 && /\d/.test(value[offset - 1]))
      return /^(st|nd|rd|th)$/i.test(word) ? word.toLowerCase() : word.toUpperCase()
    if (word.length === 1) return word.toUpperCase()
    return word
      .toLowerCase()
      .replace(/^[a-z]|(?<=['’])[a-z](?=[a-z])/g, letter => letter.toUpperCase())
  })
}

/** Normalize English address names when reading provider data.
 * @param value Provider name. @param locale Name language.
 * @returns Title-cased uniform English text; mixed-case names and Chinese retain their casing.
 * @remarks Preserve intentional mixed-case branding and uppercase Roman numerals.
 */
export function addressName(value: string, locale: LocaleKey): string {
  if (
    locale !== 'en' ||
    (value !== value.toUpperCase() && value !== value.toLowerCase())
  )
    return value
  return streetDisplayName(value, locale).replace(
    /\b(?:Ii|Iii|Iv|Vi|Vii|Viii|Ix|Xi|Xii)\b/g,
    numeral => numeral.toUpperCase(),
  )
}
