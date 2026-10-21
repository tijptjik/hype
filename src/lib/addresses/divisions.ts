// VALIDATION
import { z } from 'zod'
// TYPES
import type { LocalLocationAddress } from './localLocationAddress'
import type { LocaleKey } from '#lib/types.js'

/** Only interpretive geography can be corrected; cities are excluded and factual IDs are derived. */
export const SUBJECTIVE_DIVISIONS = {
  townId: 'town',
  ruralAreaId: 'rural_area',
  macrohoodId: 'macrohood',
  neighbourhoodId: 'neighbourhood',
  villageId: 'village',
  microhoodId: 'microhood',
  hamletId: 'hamlet',
} as const
export type SubjectiveDivisionField = keyof typeof SUBJECTIVE_DIVISIONS
const divisionSelection = z
  .union([z.string().min(1).max(200), z.strictObject({ mode: z.literal('marker') })])
  .nullable()
  .optional()
export const AddressDivisionOverridesSchema = z.strictObject({
  townId: divisionSelection,
  ruralAreaId: divisionSelection,
  macrohoodId: divisionSelection,
  neighbourhoodId: divisionSelection,
  villageId: divisionSelection,
  microhoodId: divisionSelection,
  hamletId: divisionSelection,
})
export type AddressDivisionOverrides = z.infer<typeof AddressDivisionOverridesSchema>
export type AddressDivision = {
  id: string
  class: string
  category: string
  level: number | null
  names: Record<string, { name: string | null }>
}
export type AddressDivisionContext = {
  memberships: AddressDivision[]
  options: AddressDivision[]
  available: boolean
}

/** Read authored subjective selections without promoting factual IDs to overrides.
 * @param content Local address content. @returns Explicit interpretive selections only.
 */
export function authoredDivisionOverrides(
  content?: LocalLocationAddress,
): AddressDivisionOverrides {
  return Object.fromEntries(
    Object.keys(SUBJECTIVE_DIVISIONS)
      .filter(key => content && Object.hasOwn(content, key))
      .map(key => [key, content?.[key as keyof LocalLocationAddress]]),
  )
}

/** Remove factual geographic IDs from authored corrections, without changing original content.
 * @param content Authored address draft. @returns A copy whose factual geography must be marker-derived.
 */
export function markerDerivedAddressContent(
  content: LocalLocationAddress,
): LocalLocationAddress {
  const result = { ...content }
  delete result.countryId
  delete result.areaId
  delete result.districtId
  delete result.islandId
  return result
}

/** Resolve localized names using the same locale tags as the source.
 * @param division Public geographic definition. @param locale Display locale.
 * @returns Preferred available name or stable identity.
 */
export function addressDivisionName(
  division: AddressDivision,
  locale: LocaleKey,
): string {
  const tag = locale === 'zhHant' ? 'zh-hant' : locale === 'zhHans' ? 'zh-hans' : 'en'
  return (
    division.names[tag]?.name ||
    division.names.en?.name ||
    Object.values(division.names).find(value => value.name)?.name ||
    division.id
  )
}

/** Order specific places before broader geography, preserving the established island convention.
 * @param divisions Marker memberships and subjective replacements.
 * @returns Sorted divisions excluding cities; Hong Kong Island follows district, other landforms precede it.
 */
export function orderAddressDivisions(divisions: AddressDivision[]): AddressDivision[] {
  const ordered = divisions
    .filter(item => item.class !== 'city')
    .sort((a, b) => (b.level ?? -Infinity) - (a.level ?? -Infinity))
  const landforms = ordered.filter(item => item.category === 'landform')
  const result = ordered.filter(item => item.category !== 'landform')
  const isHongKongIsland = (item: AddressDivision): boolean =>
    Object.values(item.names).some(value =>
      ['Hong Kong Island', '香港島', '香港岛'].includes(value.name ?? ''),
    )
  const first = result.findIndex(item => ['district', 'area'].includes(item.class))
  if (first < 0) return ordered
  result.splice(first, 0, ...landforms.filter(item => !isHongKongIsland(item)))
  const district = result.findLastIndex(item => item.class === 'district')
  const area = result.findIndex(item => item.class === 'area')
  result.splice(
    district >= 0 ? district + 1 : area,
    0,
    ...landforms.filter(isHongKongIsland),
  )
  return result
}

/** Replace only interpretive classes; explicit null omits a class and absence inherits the pin.
 * @param context Current marker lookup. @param overrides Explicit local selections.
 * @returns Effective, ordered divisions. Factual memberships always come from the marker.
 */
export function effectiveAddressDivisions(
  context: AddressDivisionContext,
  overrides: AddressDivisionOverrides,
): AddressDivision[] {
  const result = [...context.memberships]
  for (const [field, kind] of Object.entries(SUBJECTIVE_DIVISIONS)) {
    if (!Object.hasOwn(overrides, field)) continue
    const id = overrides[field as SubjectiveDivisionField]
    if (id && typeof id === 'object') continue
    for (let i = result.length - 1; i >= 0; i--)
      if (result[i].class === kind) result.splice(i, 1)
    const selected = context.options.find(item => item.id === id && item.class === kind)
    if (selected) result.push(selected)
  }
  return orderAddressDivisions(result)
}
