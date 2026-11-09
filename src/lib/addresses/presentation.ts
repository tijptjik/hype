// ADDRESS
import { getAddressLocale, getAddressPresentationLocale } from './featureAddress'
import { streetDisplayName } from './formatting.js'
import { formatUnit, unitDisplayExpression } from './address3d.js'
// TYPES
import type { FeatureAddress } from './featureAddress'
import type { EditableAddressField } from './addressExpressions'
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
  const values = getAddressPresentationLocale(address, locale)
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
