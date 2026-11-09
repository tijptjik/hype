// ADDRESS
import {
  getAddressLocale,
  getAddressPresentationLocale,
  setAddressOverride,
  type FeatureAddress,
} from './featureAddress.js'
import type { LocaleKey } from '#lib/types.js'

export type PhaseEditorType = 'phase' | 'stage' | 'named'

/** Read phase controls without inventing a new storage enum or discarding compound names.
 * @param address Draft. @param locale Edited language. @returns Type and editable reference/name.
 */
export function phaseEditorValue(
  address: FeatureAddress,
  locale: LocaleKey,
): { type: PhaseEditorType; value: string } {
  const fields = getAddressPresentationLocale(address, locale)
  const name = String(fields.phaseName ?? '')
  const ref = String(fields.phaseRef ?? '')
  const expression = String(fields.phaseExpression ?? '').trim()
  if (!name && ref && validPhaseReference(ref)) return { type: 'phase', value: ref }
  if (name === '期' && (ref || !expression) && validPhaseReference(ref))
    return { type: 'phase', value: ref }
  const match = /^(PHASE|STAGE)(?:\s+([A-Z0-9]+))?$/i.exec(
    expression || `${name} ${ref}`.trim(),
  )
  if (match && validPhaseReference(match[2] ?? ''))
    return {
      type: /^STAGE$/i.test(match[1]) ? 'stage' : 'phase',
      value: match[2] ?? '',
    }
  if (/^(PHASE|STAGE)$/i.test(name) && validPhaseReference(ref))
    return { type: /^STAGE$/i.test(name) ? 'stage' : 'phase', value: ref }
  const chinese = /^第?([0-9A-Za-z零〇一二兩三四五六七八九十百]+)期$/.exec(expression)
  if (chinese) return { type: 'phase', value: chinese[1] }
  return { type: expression || name ? 'named' : 'phase', value: expression || name }
}

/** Accept ALS-style numbers, Roman numerals, letters and numeric/Roman suffix letters.
 * @param value Ordinal entry. @returns Whether it can be stored as one reference.
 */
export function validPhaseReference(value: string): boolean {
  return (
    value === '' ||
    /^(?:\d+[A-Z]?|[IVXLCDM]+[A-Z]?|[A-Z]|[零〇一二兩三四五六七八九十百]+)$/i.test(
      value,
    )
  )
}

/** Compose phase fields using the existing name/reference/expression contract.
 * @param address Draft. @param locale Edited language. @param type Form-only category.
 * @param value Ordinal or full named phase. @returns Updated draft; Chinese ordinal references are shared, while named phases remain locale-specific.
 */
export function setPhaseEditorValue(
  address: FeatureAddress,
  locale: LocaleKey,
  type: PhaseEditorType,
  value: string,
): FeatureAddress {
  if (type !== 'named' && !validPhaseReference(value)) type = 'named'
  const other: LocaleKey | undefined =
    locale === 'en' ? undefined : locale === 'zhHant' ? 'zhHans' : 'zhHant'
  const shareReference =
    other && type !== 'named' && phaseEditorValue(address, other).type !== 'named'
  const name =
    type === 'named'
      ? value
      : locale === 'en'
        ? type === 'stage'
          ? 'Stage'
          : 'Phase'
        : '期'
  const expression =
    type === 'named'
      ? value
      : !value
        ? ''
        : locale === 'en'
          ? `${name} ${value}`
          : `第${value}期`
  for (const [key, content] of Object.entries({
    phaseName: name || null,
    phaseRef: type === 'named' ? null : value || null,
    phaseExpression: expression,
  })) {
    address = setAddressOverride(
      address,
      locale,
      key as 'phaseName' | 'phaseRef' | 'phaseExpression',
      content,
    )
  }
  if (shareReference && other) {
    const otherName = String(getAddressLocale(address, other).phaseName || '期')
    for (const [key, content] of Object.entries({
      phaseName: otherName,
      phaseRef: value || null,
      phaseExpression: value ? `第${value}期` : '',
    }))
      address = setAddressOverride(
        address,
        other,
        key as 'phaseName' | 'phaseRef' | 'phaseExpression',
        content,
      )
  }
  return address
}
