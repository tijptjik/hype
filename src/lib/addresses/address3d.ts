// Shared semantic floor/unit codes, parsers and formatting; local Feature details have no inventory ID.
export * from '@saanseoi/address/units'

import { formatFloor as sharedFormatFloor } from '@saanseoi/address/units'

/** Format site-style English floor labels without appending /F to named levels.
 * @param details Parsed floor semantics. @param locale Display language.
 * @returns G/F and numbered floors retain /F; UG, LG, B, M, C, P and R do not.
 */
export function formatFloor(
  ...[details, locale]: Parameters<typeof sharedFormatFloor>
): string {
  // The source-text parser repeats named floor codes in floorRef; they are types, not suffixes.
  const normalized = details.floorType &&
    !['F', 'X'].includes(details.floorType) &&
    details.floorRef?.toUpperCase() === details.floorType
    ? { ...details, floorRef: '' }
    : details
  const formatted = sharedFormatFloor(normalized, locale)
  return locale === 'en' &&
    details.floorType &&
    !['F', 'G', 'X'].includes(details.floorType)
    ? formatted.replace(/\/F$/, '')
    : formatted
}
