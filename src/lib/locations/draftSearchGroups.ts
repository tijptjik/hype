// ADDRESS
import { getAddressLocale, type FeatureAddress } from '#lib/addresses/featureAddress.js'
import { locationDistance } from './searchPresentation'

export type DraftSearchResult = {
  id: string
  kind: 'establishment' | 'building' | 'address'
  names: Record<string, string>
  address: FeatureAddress
}
export type DraftSearchGroup<T> = {
  representative: T
  members: T[]
  numberRange?: string
  expandable: boolean
}

/** Collapse nearby address alternatives for the same named premises and street.
 * @param rows Unmodified provider records.
 * @returns Ordered groups; actual source ranges precede naturally sorted numbers.
 * @remarks Never invent a range identity or merge establishments. Coordinates must
 * be within 100 metres of the first record to avoid merging distant namesakes.
 */
export function groupDraftSearchResults<T extends DraftSearchResult>(
  rows: T[],
): DraftSearchGroup<T>[] {
  const groups: Array<DraftSearchGroup<T> & { key: string }> = []
  const parts = (row: T) => getAddressLocale(row.address, 'en')
  const number = (row: T): string => {
    const values = parts(row)
    return String(values.buildingNumberExpression || values.buildingNumberFrom || '')
  }
  const range = (row: T): boolean => {
    const values = parts(row)
    return (
      Boolean(
        values.buildingNumberTo &&
          values.buildingNumberTo !== values.buildingNumberFrom,
      ) || /\d\s*[-–]\s*\d/.test(number(row))
    )
  }
  for (const row of rows) {
    const values = parts(row)
    const building = values.premisesName || values.buildingName
    const key =
      row.kind === 'address' && building
        ? JSON.stringify([
            building,
            values.premisesName,
            values.streetName,
            values.premisesName ? undefined : values.blockExpression,
            values.premisesName ? undefined : values.phaseExpression,
          ]).toLowerCase()
        : ''
    const group =
      key &&
      row.address.coordinates &&
      groups.find(
        group =>
          group.key === key &&
          group.members[0].address.coordinates &&
          locationDistance(
            group.members[0].address.coordinates,
            row.address.coordinates!,
          ) <= 100,
      )
    if (group) group.members.push(row)
    else groups.push({ key, representative: row, members: [row], expandable: Boolean(key) })
  }
  for (const group of groups) {
    group.members.sort(
      (a, b) =>
        Number(range(b)) - Number(range(a)) ||
        Number(Boolean(number(a))) - Number(Boolean(number(b))) ||
        number(a).localeCompare(number(b), undefined, { numeric: true }),
    )
    group.representative = group.members[0]
  }
  return groups.map(({ representative, members, key }) => ({
    expandable: Boolean(key) && members.length > 1,
    representative,
    members,
    numberRange: collapsedAddressNumberRange(members),
  }))
}

/** Summarise a collapsed group's numeric span without changing any selectable source record.
 * @param members Actual addresses in the group.
 * @returns Display-only range, or undefined when numbers cannot be safely compared.
 * @remarks A span does not assert that every intermediate number exists.
 */
export function collapsedAddressNumberRange(
  members: DraftSearchResult[],
): string | undefined {
  if (members.length < 2) return undefined
  const endpoints: string[] = []
  for (const member of members) {
    const values = getAddressLocale(member.address, 'en')
    const expression = String(
      values.buildingNumberExpression ||
        [values.buildingNumberFrom, values.buildingNumberTo].filter(Boolean).join('-'),
    ).trim()
    const match = /^(\d+[A-Za-z]?)(?:\s*[-–]\s*(\d+[A-Za-z]?))?$/.exec(expression)
    if (!match) return undefined
    endpoints.push(match[1], match[2] ?? match[1])
  }
  endpoints.sort((a, b) =>
    a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }),
  )
  const first = endpoints[0]
  const last = endpoints[endpoints.length - 1]
  return first === last ? undefined : `${first}-${last}`
}
