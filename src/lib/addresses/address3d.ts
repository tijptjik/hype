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
  const formatted = sharedFormatFloor(details, locale)
  return locale === 'en' &&
    details.floorType &&
    !['F', 'G', 'X'].includes(details.floorType)
    ? formatted.replace(/\/F$/, '')
    : formatted
}
