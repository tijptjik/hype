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
  // Select at most one existing source path for one neighbourhood.
  localityPaths: z
    .array(z.array(z.string().min(1).max(200)).min(1).max(4))
    .max(1)
    .nullable()
    .optional(),
  townId: divisionSelection,
  ruralAreaId: divisionSelection,
  macrohoodId: divisionSelection,
  neighbourhoodId: divisionSelection,
  villageId: divisionSelection,
  microhoodId: divisionSelection,
  hamletId: divisionSelection,
})
export type AddressDivisionOverrides = z.infer<typeof AddressDivisionOverridesSchema>
const hierarchyEntry = z.object({
  id: z.string(),
  class: z.string(),
  fullContainment: z.boolean().nullable().optional(),
})
export const AddressDivisionHierarchiesSchema = z.object({
  administrative: z.array(z.array(hierarchyEntry)).optional(),
  locality: z.array(z.array(hierarchyEntry)).optional(),
  landform: z.array(z.array(hierarchyEntry)).optional(),
})
export type AddressDivisionGroup = 'administrative' | 'locality' | 'landform'
export type AddressDivision = {
  id: string
  class: string
  category: string
  level: number | null
  names: Record<string, { name: string | null }>
  hierarchies?: z.infer<typeof AddressDivisionHierarchiesSchema>
  /** Ancestors of the chosen source path, including explicitly selected boundary branches. */
  selectedLocalityAncestors?: string[]
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
  if (Array.isArray(overrides.localityPaths)) {
    const options = new Map(context.options.map(item => [item.id, item]))
    const chosen = new Map<string, AddressDivision>()
    const selectedPaths =
      overrides.localityPaths.length <= 1 ? overrides.localityPaths : []
    // One selected source path replaces interpretive memberships without inventing ancestry.
    for (const path of selectedPaths) {
      if (!isApprovedLocalityPath(path, options)) continue
      const members = path
        .map(id => options.get(id))
        .filter((item): item is AddressDivision => item !== undefined)
      for (const [index, member] of members.entries()) {
        const copy: AddressDivision = chosen.get(member.id) ?? {
          ...member,
          selectedLocalityAncestors: members
            .slice(0, index)
            .map(ancestor => ancestor.id),
        }
        chosen.set(copy.id, copy)
      }
    }
    return orderAddressDivisions([
      ...result.filter(
        item => !Object.values(SUBJECTIVE_DIVISIONS).some(kind => kind === item.class),
      ),
      ...chosen.values(),
    ])
  }
  return orderAddressDivisions(result)
}

/** Read the source locality level, falling back to its supported taxonomy when metadata is absent.
 * @param division Existing public division. @returns Its editable level, or null for factual/unsupported geography.
 */
export function addressLocalityLevel(division: AddressDivision): number | null {
  const levels: Record<string, number> = {
    town: 3,
    rural_area: 4,
    macrohood: 4,
    neighbourhood: 5,
    village: 5,
    microhood: 6,
    hamlet: 6,
  }
  if (!Object.hasOwn(levels, division.class)) return null
  const level = division.level ?? levels[division.class]
  return Number.isInteger(level) && level >= 3 && level <= 6 ? level : null
}

/** Validate a composed path against current definitions, never against the client's claimed levels.
 * @param path Root-to-leaf stable identities. @param definitions Mirrored definitions keyed by ID.
 * @returns Whether all members exist and each child is strictly more specific than its parent.
 */
export function isValidLocalityPath(
  path: string[],
  definitions: ReadonlyMap<string, AddressDivision>,
): boolean {
  if (!path.length || path.length > 4) return false
  let previous = 2
  for (const id of path) {
    const division = definitions.get(id)
    const level = division ? addressLocalityLevel(division) : null
    if (level === null || level <= previous) return false
    previous = level
  }
  return true
}

/** Read complete source locality paths, preserving boundary alternatives and excluding cities.
 * @param division Selected public division. @returns Root-to-leaf identities including the selected neighbourhood.
 * @remarks Missing ancestry means a standalone neighbourhood; an explicit empty branch also remains selectable.
 */
export function sourceLocalityPathIds(division: AddressDivision): string[][] {
  const ancestors = division.hierarchies?.locality
  const paths = (ancestors?.length ? ancestors : [[]]).map(branch => [
    ...branch.filter(item => item.class !== 'city').map(item => item.id),
    division.id,
  ])
  return [...new Map(paths.map(path => [JSON.stringify(path), path])).values()]
}

/** Validate that a selection is one complete, existing source path for its neighbourhood.
 * @param path Submitted root-to-leaf identities. @param definitions Current mirrored definitions.
 * @returns Whether the path exists verbatim in the selected division's ancestry and respects its levels.
 */
export function isApprovedLocalityPath(
  path: string[],
  definitions: ReadonlyMap<string, AddressDivision>,
): boolean {
  if (!isValidLocalityPath(path, definitions)) return false
  const leaf = definitions.get(path[path.length - 1])
  return (
    !!leaf &&
    sourceLocalityPathIds(leaf).some(
      source => JSON.stringify(source) === JSON.stringify(path),
    )
  )
}

/** Offer only the supplied ancestor paths for a neighbourhood, including boundary alternatives.
 * @param division Selected existing division. @param options Mirrored locality definitions.
 * @returns Distinct resolvable source ancestor paths, excluding the selected division itself.
 */
export function localityParentPaths(
  division: AddressDivision,
  options: AddressDivision[],
): AddressDivision[][] {
  const definitions = new Map(options.map(item => [item.id, item]))
  return sourceLocalityPathIds(division)
    .filter(path => isApprovedLocalityPath(path, definitions))
    .map(path =>
      path
        .slice(0, -1)
        .map(id => definitions.get(id))
        .filter((item): item is AddressDivision => item !== undefined),
    )
}

/** Save one source path alongside scalar selections for shared authored-address consumers.
 * @param paths The chosen source path, or an empty selection. @returns Locale-independent corrections including explicit omissions.
 */
export function localityPathOverrides(
  paths: AddressDivision[][],
): AddressDivisionOverrides {
  if (paths.length > 1) throw new Error('MULTIPLE_LOCALITY_SELECTIONS')
  const members = paths.flat()
  return {
    ...Object.fromEntries(
      Object.entries(SUBJECTIVE_DIVISIONS).map(([field, kind]) => {
        const ids = [
          ...new Set(members.filter(item => item.class === kind).map(item => item.id)),
        ]
        return [field, ids.length === 1 ? ids[0] : null]
      }),
    ),
    localityPaths: paths.map(path => path.map(item => item.id)),
  }
}

/** Separate administrative ancestry, locality membership and physical islands.
 * @param divisions Effective marker memberships, including explicit locality corrections.
 * @returns Independent groups with broad-to-specific paths supported by source ancestry.
 * @remarks Levels and matching names never establish parentage. Partial or unknown
 * source containment stays unconnected unless the user explicitly selects that source branch;
 * overridden ancestors are not reintroduced.
 */
export function groupAddressDivisions(
  divisions: AddressDivision[],
): Array<{ key: AddressDivisionGroup; paths: AddressDivision[][] }> {
  const groups: AddressDivisionGroup[] = ['administrative', 'locality', 'landform']
  const groupFor = (division: AddressDivision): AddressDivisionGroup =>
    division.category === 'administrative' ||
    ['country', 'sar', 'area', 'district'].includes(division.class)
      ? 'administrative'
      : division.category === 'landform' ||
          ['major_island', 'minor_island', 'islet', 'island_group'].includes(
            division.class,
          )
        ? 'landform'
        : 'locality'
  return groups.flatMap(key => {
    const members = divisions.filter(
      item => item.class !== 'city' && groupFor(item) === key,
    )
    const byId = new Map(members.map(item => [item.id, item]))
    const paths = new Map<string, AddressDivision[]>()
    // Connect only effective members with explicit, fully contained source ancestry.
    for (const member of members) {
      const ancestors =
        key === 'locality' && member.selectedLocalityAncestors
          ? [member.selectedLocalityAncestors]
          : (member.hierarchies?.[key] ?? []).map(branch =>
              branch
                .filter(item => item.class !== 'city' && item.fullContainment === true)
                .map(item => item.id),
            )
      for (const branch of ancestors.length ? ancestors : [[]]) {
        const ids = [
          ...new Set([
            ...branch.filter(id => id !== member.id && byId.has(id)),
            member.id,
          ]),
        ]
        paths.set(
          JSON.stringify(ids),
          ids
            .map(id => byId.get(id))
            .filter((item): item is AddressDivision => item !== undefined),
        )
      }
    }
    // Omit shorter copies already represented within an evidenced branch; preserve alternatives.
    const candidates = [...paths.values()]
    const branches = candidates.filter(
      path =>
        !candidates.some(
          other =>
            other.length > path.length &&
            other.some((_, start) =>
              path.every((item, offset) => other[start + offset]?.id === item.id),
            ),
        ),
    )
    return branches.length ? [{ key, paths: branches }] : []
  })
}
