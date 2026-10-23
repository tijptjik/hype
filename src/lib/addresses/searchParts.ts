// VALIDATION
import { z } from 'zod'
// ADDRESS
import {
  getAddressLocale,
  getAddressDisplay,
  type FeatureAddress,
} from './featureAddress'
import { getAddressDivisions } from './addressExpressions'
// TYPES
import type { LocaleKey } from '#lib/types.js'

export type AddressSearchPart = {
  kind:
    | 'building'
    | 'premises'
    | 'block'
    | 'phase'
    | 'unit'
    | 'floor'
    | 'street'
    | 'locality'
    | 'address'
  text: string
}

/** Present source address parts without administrative geography or guessed parsing.
 * @param address Structured source address and corrections.
 * @param locale Preferred display language.
 * @returns Distinct address blocks, keeping number and street together.
 */
export function addressSearchParts(
  address: FeatureAddress,
  locale: LocaleKey,
): AddressSearchPart[] {
  const values = getAddressLocale(address, locale)
  const text = (field: keyof typeof values): string =>
    typeof values[field] === 'string' ? values[field].trim() : ''
  const number =
    text('buildingNumberExpression') ||
    [text('buildingNumberFrom'), text('buildingNumberTo')]
      .filter(Boolean)
      .join(text('buildingNumberConnector') || '-')
  const street = (
    locale === 'en' ? [number, text('streetName')] : [text('streetName'), number]
  )
    .filter(Boolean)
    .join(locale === 'en' ? ' ' : '')
  const parts: AddressSearchPart[] = [
    { kind: 'unit', text: text('unitExpression') },
    { kind: 'floor', text: text('floorExpression') },
    { kind: 'building', text: text('buildingName') },
    {
      kind: 'block',
      text:
        text('blockExpression') ||
        [text('blockType'), text('blockRef')].filter(Boolean).join(' '),
    },
    { kind: 'phase', text: text('phaseExpression') || text('phaseName') },
    { kind: 'premises', text: text('premisesName') },
    { kind: 'street', text: street },
    ...getAddressDivisions(address, locale)
      .filter(division =>
        [
          'locality',
          'hood',
          'macrohood',
          'neighbourhood',
          'microhood',
          'town',
          'village',
          'hamlet',
          'rural_area',
        ].includes(division.role),
      )
      .map(division => ({ kind: 'locality' as const, text: division.name })),
  ]
  const seen = new Set<string>()
  const distinct = parts.filter(part => {
    const key = part.text.toLocaleLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
  // Free-form establishment addresses remain intact; never manufacture structured parts.
  return distinct.length
    ? distinct
    : ([{ kind: 'address', text: getAddressDisplay(address, locale) }].filter(
        part => part.text,
      ) as AddressSearchPart[])
}

/** Read explicit locality IDs from an address preview without inferring membership.
 * @param address Retained source address.
 * @returns Distinct non-administrative IDs for cached label lookup.
 */
export function addressLocalityIds(address: FeatureAddress): string[] {
  const source = z
    .object({
      data: z.object({
        attributes: z.object({
          divisionRelationships: z
            .array(z.object({ role: z.string(), divisionId: z.string() }))
            .optional(),
        }),
      }),
    })
    .safeParse(address.source.records)
  if (!source.success) return []
  const attributes = source.data.data.attributes
  const roles = [
    'locality',
    'hood',
    'macrohood',
    'neighbourhood',
    'microhood',
    'town',
    'village',
    'hamlet',
    'rural_area',
  ]
  return [
    ...new Set(
      (attributes?.divisionRelationships ?? []).flatMap(link =>
        link.role && roles.includes(link.role) && typeof link.divisionId === 'string'
          ? [link.divisionId]
          : [],
      ),
    ),
  ]
}
