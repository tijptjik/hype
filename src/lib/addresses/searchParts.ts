// VALIDATION
import { z } from 'zod'
// ADDRESS
import {
  getAddressLocale,
  getAddressDisplay,
  type FeatureAddress,
} from './featureAddress'
import { streetDisplayName } from './formatting.js'
import { addressComponentValue } from './presentation.js'
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
  localityClass?: string
}

/** Present source address parts without administrative geography or guessed parsing.
 * @param address Structured source address and corrections.
 * @param locale Preferred display language.
 * @param numberSummary Optional display-only number span for a collapsed group.
 * @returns Distinct address blocks, keeping number and street together.
 */
export function addressSearchParts(
  address: FeatureAddress,
  locale: LocaleKey,
  numberSummary?: string,
): AddressSearchPart[] {
  const values = getAddressLocale(address, locale)
  const text = (field: keyof typeof values): string =>
    typeof values[field] === 'string' ? values[field].trim() : ''
  const number =
    numberSummary ||
    text('buildingNumberExpression') ||
    [text('buildingNumberFrom'), text('buildingNumberTo')]
      .filter(Boolean)
      .join(text('buildingNumberConnector') || '-')
  const street = (
    locale === 'en'
      ? [number, streetDisplayName(text('streetName'), locale)]
      : [text('streetName'), number]
  )
    .filter(Boolean)
    .join(locale === 'en' ? ' ' : '')
  // Included division classes retain semantic column identity even when a row lacks smaller places.
  const included = z
    .object({
      included: z
        .array(
          z.object({
            id: z.string(),
            attributes: z.object({ class: z.string().nullish() }).optional(),
          }),
        )
        .optional(),
    })
    .safeParse(address.source.rawSource)
  const parts: AddressSearchPart[] = [
    { kind: 'unit', text: addressComponentValue(address, locale, 'unitExpression') },
    { kind: 'floor', text: text('floorExpression') },
    {
      kind: 'block',
      text:
        text('blockExpression') ||
        [text('blockType'), text('blockRef')].filter(Boolean).join(' '),
    },
    { kind: 'phase', text: text('phaseExpression') || text('phaseName') },
    { kind: 'building', text: text('buildingName') },
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
      .map(division => ({
        kind: 'locality' as const,
        text: division.name,
        localityClass:
          (included.success
            ? included.data.included?.find(row => row.id === division.id)?.attributes
                ?.class
            : undefined) ?? division.role,
      })),
  ]
  const seen = new Set<string>()
  const distinct = parts.filter(part => {
    const key = part.text.toLocaleLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
  // A resolved floor or unit must not hide the unresolved two-dimensional address text.
  if (
    distinct.length &&
    distinct.every(part => part.kind === 'unit' || part.kind === 'floor') &&
    text('formattedAddress')
  )
    distinct.push({ kind: 'address', text: text('formattedAddress') })
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
    .safeParse(address.source.rawSource)
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
