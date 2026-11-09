// ADDRESS
import { getAddressLocale, getAddressPresentationLocale } from './featureAddress'
import { streetDisplayName } from './formatting.js'
import { formatUnit, unitDisplayExpression } from './address3d.js'
// TYPES
import type { FeatureAddress } from './featureAddress'
import {
  EDITABLE_ADDRESS_FIELDS,
  type EditableAddressField,
} from './addressExpressions'
import type { LocaleKey } from '#lib/types.js'

/** Present parsed components as a single editable expression, keeping ordering implicit.
 * @param address Current source and local corrections. @param locale Display language.
 * @param field User-facing combined component. @returns Expression or an empty value.
 */
export function addressComponentValue(
  address: FeatureAddress,
  locale: LocaleKey,
  field: EditableAddressField,
): string {
  if (
    field === 'unitExpression' &&
    address.unitDetails &&
    Object.hasOwn(address.unitDetails, 'unitRef')
  )
    return address.unitDetails.unitType === 'X'
      ? String(
          getAddressLocale(address, locale).unitExpression ??
            address.unitDetails.unitRef ??
            '',
        )
      : formatUnit(address.unitDetails, locale)
  // Editable names expose missing translations instead of filling them from another script.
  const values =
    field === 'streetName' || field === 'buildingName' || field === 'premisesName'
      ? getAddressLocale(address, locale)
      : getAddressPresentationLocale(address, locale)
  if (typeof values[field] === 'string' && values[field]) {
    const value = values[field] as string
    return field === 'streetName'
      ? streetDisplayName(value, locale)
      : field === 'unitExpression'
        ? unitDisplayExpression(value, locale)
        : value
  }
  const text = (key: keyof typeof values): string =>
    typeof values[key] === 'string' ? (values[key] as string) : ''
  if (field === 'buildingNumberExpression')
    return (
      [text('buildingNumberFrom'), text('buildingNumberTo')]
        .filter(Boolean)
        .join(text('buildingNumberConnector') || '-') ||
      (['en', 'zhHant', 'zhHans'] as const)
        .filter(other => other !== locale)
        .map(other => {
          const row = getAddressLocale(address, other)
          return String(
            row.buildingNumberExpression ||
              [row.buildingNumberFrom, row.buildingNumberTo]
                .filter(Boolean)
                .join(String(row.buildingNumberConnector || '-')),
          )
        })
        .find(Boolean) ||
      ''
    )
  if (field === 'blockExpression') {
    const terms: Record<string, [string, string, string]> = {
      block: ['Block', '座', '座'],
      tower: ['Tower', '幢', '幢'],
      building: ['Building', '大廈', '大厦'],
      house: ['House', '屋', '屋'],
      villa: ['Villa', '別墅', '别墅'],
      apartment: ['Apartment', '閣', '阁'],
      parking: ['Carpark', '停車場', '停车场'],
      flat: ['Flat', '室', '室'],
      unit: ['Unit', '單位', '单位'],
    }
    const type =
      terms[text('blockType')]?.[locale === 'en' ? 0 : locale === 'zhHant' ? 1 : 2] ??
      text('blockType')
    return (
      (values.blockTypeBeforeNumber ?? locale === 'en')
        ? [type, text('blockRef')]
        : [text('blockRef'), type]
    )
      .filter(Boolean)
      .join(locale === 'en' ? ' ' : '')
  }
  if (field === 'phaseExpression' && text('phaseRef'))
    return locale === 'en'
      ? `${text('phaseName') || 'Phase'} ${text('phaseRef')}`
      : `第${text('phaseRef')}期`
  return ''
}

/** Detect authored address parts across languages, excluding display text and access hints.
 * @param address Source address with local overrides.
 * @returns Whether any structured address field has a non-empty value.
 */
export function hasStructuredAddressComponents(address: FeatureAddress): boolean {
  const content =
    address.association?.content ??
    address.canonical?.content ??
    address.source.canonical?.content ??
    address.source.authored
  const raw = address.source.rawSource.data as
    | { attributes?: { i18n?: Record<string, Record<string, unknown>> } }
    | undefined
  const rows: Record<string, Record<string, unknown>> = content?.i18n ??
  raw?.attributes?.i18n ??
  {}
  const tags = new Set([...Object.keys(rows), ...Object.keys(address.overrides)])
  return EDITABLE_ADDRESS_FIELDS.some(
    field =>
      field !== 'formattedAddress' &&
      field !== 'accessHint' &&
      ((['en', 'zhHant', 'zhHans'] as const).some(locale =>
        addressComponentValue(address, locale, field).trim(),
      ) ||
        [...tags].some(tag => {
          const overrides = address.overrides[tag.toLowerCase()] ?? {}
          const value = Object.hasOwn(overrides, field)
            ? overrides[field]
            : rows[tag]?.[field]
          return typeof value === 'string' && Boolean(value.trim())
        })),
  )
}
