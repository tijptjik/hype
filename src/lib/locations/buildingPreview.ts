// ADDRESS
import {
  ADDRESS_LOCALES,
  getAddressDisplay,
  type FeatureAddress,
} from '#lib/addresses/featureAddress.js'
import { addressComponentValue } from '#lib/addresses/presentation.js'
import { parseStreetNumber } from '#lib/addresses/streetNumber.js'
import { researchStreetAddresses } from '#lib/fieldResearch/locationStreets.js'
import { buildingStreetLabel, type BuildingStreet } from './buildingStreetAddresses'
import type { LocaleKey } from '#lib/types.js'

/** Collect the reviewed names, address labels and each explicit street-number endpoint.
 * @param names Localized building names. @param address Effective address in the editor.
 * @param streets Additional frontages. @returns Distinct terms for one catalogue preview.
 */
export function buildingPreviewTerms(
  names: Record<string, string>,
  address: FeatureAddress,
  streets: BuildingStreet[],
): string[] {
  const terms = new Set(
    Object.values(names)
      .map(value => value.trim())
      .filter(Boolean),
  )
  const addStreet = (street: string, expression: string, tag: string): void => {
    if (!street) return
    const parsed = parseStreetNumber(expression, true)
    for (const number of parsed.valid ? [parsed.number.from, parsed.number.to] : []) {
      if (number)
        terms.add(
          buildingStreetLabel(
            { names: { [tag]: street }, number, priority: null, head: null },
            tag,
          ),
        )
    }
  }
  for (const [locale, tag] of Object.entries(ADDRESS_LOCALES)) {
    const field = (key: Parameters<typeof addressComponentValue>[2]): string =>
      addressComponentValue(address, locale as LocaleKey, key)
    const buildingName = field('buildingName').trim()
    if (buildingName) terms.add(buildingName)
    const label = getAddressDisplay(address, locale as LocaleKey, [], 'building').trim()
    if (label) terms.add(label)
    addStreet(field('streetName'), field('buildingNumberExpression'), tag)
    // Older imports sometimes retain only formatted address text.
    if (locale === 'en') {
      // Normalize explicit number pairs before the legacy street reader splits address components on commas.
      const numberedLabel = label.replace(
        /(\d+[a-z]?)\s*(?:,|\band\b)\s*(?=\d+[a-z]?\s+[^\d])/gi,
        '$1 & ',
      )
      for (const line of researchStreetAddresses(numberedLabel))
        addStreet(line.street, line.number, tag)
    } else {
      for (const part of label.split(/[·，,\n]/u)) {
        const match =
          /([^\d]+?)(\d+[A-Za-z]?(?:\s*[-–—/&至及與和、]\s*(?:\d+[A-Za-z]?|[A-Za-z]))?)\s*[號号]/u.exec(
            part.trim(),
          )
        if (match) addStreet(match[1].trim(), match[2], tag)
      }
    }
  }
  for (const street of streets)
    for (const [tag, name] of Object.entries(street.names)) {
      terms.add(buildingStreetLabel(street, tag))
      addStreet(name, street.number, tag)
    }
  return [...terms]
}
