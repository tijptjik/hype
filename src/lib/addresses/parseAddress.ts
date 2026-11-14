// SHARED ADDRESS CONTRACT
import {
  ADDRESS_PARSER_VERSION as SHARED_ADDRESS_PARSER_VERSION,
  parseAddressContent as parseSharedAddressContent,
} from '@saanseoi/address'
// DATA
import catalog from '#lib/routing/mtr-catalog.json'

export const ADDRESS_PARSER_VERSION = `${SHARED_ADDRESS_PARSER_VERSION}+mtr.1`
const stationCodes = new Set(catalog.stations.map(station => station.id))

/** Remove known station prefixes from MTR shop references before unit parsing.
 * @param text Original address text.
 * @returns Address with station shop references expressed as Shop plus the unit number.
 * @remarks Unknown codes and addresses without an explicit MTR marker remain untouched.
 */
function normalizeMtrShop(text: string): string {
  if (!/\bMTR\b/i.test(text)) return text
  return text.replace(
    /\b(?:Shop\s+)?([A-Z]{3})\s*(\d+[A-Z]?)(?![\w-])/gi,
    (match, code: string, unit: string) =>
      stationCodes.has(code.toUpperCase()) ? `Shop ${unit}` : match,
  )
}

/** Parse local address proposals with known MTR station shop prefixes resolved.
 * @param labels Original localized address text, including any MTR station title.
 * @param context Optional reviewed building and street dictionaries.
 * @returns Parsed content retaining the original source text and conflict diagnostics.
 * @remarks Normalization changes the proposal only; immutable source evidence is preserved.
 */
export function parseAddressContent(
  labels: Parameters<typeof parseSharedAddressContent>[0],
  context?: Parameters<typeof parseSharedAddressContent>[1],
): ReturnType<typeof parseSharedAddressContent> {
  const normalized = Object.fromEntries(
    Object.entries(labels).map(([locale, text]) => [locale, normalizeMtrShop(text)]),
  )
  return {
    ...parseSharedAddressContent(normalized, context),
    source: { ...labels },
    parserVersion: ADDRESS_PARSER_VERSION,
  }
}
