// ADDRESS
import {
  ADDRESS_LOCALES,
  getAddressLocale,
  type FeatureAddress,
} from './featureAddress'
import { normalizeNameSearch } from './nameSearch'
import { addressComparisonName, applyAddressAbbreviations } from './formatting'
import { formatStreetNumber } from './streetNumber.js'

export type MapAddressDisagreement = {
  field: 'building' | 'block' | 'number' | 'street'
  selected: string
  mapped: string
}

/** Compare explicit containing-building evidence with the selected address.
 * @param address Current selected draft. @param labels Building/feature names. @param number Unique map number.
 * @param streets Explicit footprint street names, never nearby-road guesses.
 * @returns Review notices; no draft values are changed and absent evidence is not disagreement.
 */
export function mapAddressDisagreements(
  address: FeatureAddress,
  labels: string[],
  number: string | null,
  streets: string[],
): MapAddressDisagreement[] {
  const fields = Object.keys(ADDRESS_LOCALES).map(locale =>
    getAddressLocale(address, locale as keyof typeof ADDRESS_LOCALES),
  )
  const strings = (values: unknown[]): string[] => [
    ...new Set(
      values
        .filter(
          (value): value is string =>
            typeof value === 'string' && Boolean(value.trim()),
        )
        .map(value => value.trim()),
    ),
  ]
  const normalize = (value: string): string =>
    normalizeNameSearch(applyAddressAbbreviations(value))
  const stripBlock = (value: string): string =>
    value
      .replace(
        /\s+(?:Block|Tower|Building|House|Villa)\s+(?:[A-Z]|[IVX]{1,6}|\d+[A-Z]?)$/i,
        '',
      )
      .trim()
  const result: MapAddressDisagreement[] = []
  const compare = (
    field: MapAddressDisagreement['field'],
    selected: string[],
    mapped: string[],
  ): void => {
    if (field !== 'number') {
      // Compare each language separately and retain only localized correction text.
      for (const locale of Object.keys(
        ADDRESS_LOCALES,
      ) as (keyof typeof ADDRESS_LOCALES)[]) {
        const localFields = getAddressLocale(address, locale)
        const localValues = [
          ...Object.values(localFields),
          localFields.blockType && localFields.blockRef
            ? `${localFields.blockType} ${localFields.blockRef}`
            : '',
        ]
        const localizedSelected = strings(
          selected
            .filter(value =>
              localValues.some(
                raw =>
                  typeof raw === 'string' &&
                  (raw === value || stripBlock(raw) === value),
              ),
            )
            .map(value => addressComparisonName(value, locale)),
        )
        const localizedMapped = strings(
          mapped.map(value => addressComparisonName(value, locale)),
        )
        const unique = [
          ...new Map(localizedMapped.map(value => [normalize(value), value])).values(),
        ]
        if (
          localizedSelected.length &&
          unique.length === 1 &&
          !localizedSelected.some(value => normalize(value) === normalize(unique[0]))
        ) {
          const original = selected.find(
            value =>
              normalize(addressComparisonName(value, locale)) ===
              normalize(localizedSelected[0]),
          )
          if (!original) continue
          result.push({ field, selected: original, mapped: unique[0] })
          return
        }
      }
      return
    }
    // Number punctuation distinguishes a range from a pair; name matching cannot erase it.
    const key = (value: string): string =>
      formatStreetNumber(value).toLowerCase().replace(/\s+/g, '')
    const unique = [...new Map(mapped.map(value => [key(value), value])).values()]
    if (
      selected.length &&
      unique.length === 1 &&
      !selected.some(value => key(value) === key(unique[0]))
    )
      result.push({ field, selected: selected[0], mapped: unique[0] })
  }
  compare(
    'building',
    strings(fields.flatMap(value => [value.premisesName, value.buildingName])).map(
      stripBlock,
    ),
    strings(labels.map(stripBlock)),
  )
  const blocks = strings(
    labels.flatMap(
      label =>
        /(?:^|\s)((?:Block|Tower|Building|House|Villa)\s+(?:[A-Z]|[IVX]{1,6}|\d+[A-Z]?))$/i.exec(
          label,
        )?.[1] ?? [],
    ),
  )
  compare(
    'block',
    strings(
      fields.map(
        value =>
          value.blockExpression ||
          (value.blockType && value.blockRef
            ? `${value.blockType} ${value.blockRef}`
            : ''),
      ),
    ),
    blocks,
  )
  compare(
    'number',
    strings(
      fields.map(
        value =>
          value.buildingNumberExpression ||
          formatStreetNumber(
            '',
            String(value.buildingNumberFrom ?? ''),
            String(value.buildingNumberTo ?? ''),
            String(value.buildingNumberConnector || '-'),
          ),
      ),
    ),
    number ? [number] : [],
  )
  compare('street', strings(fields.map(value => value.streetName)), strings(streets))
  return result
}
