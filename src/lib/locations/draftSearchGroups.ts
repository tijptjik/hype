// ADDRESS
import { getAddressLocale, type FeatureAddress } from '#lib/addresses/featureAddress.js'
import { locationDistance } from './searchPresentation'

export type DraftSearchResult = {
  id: string
  kind: 'establishment' | 'address'
  names: Record<string, string>
  address: FeatureAddress
}
export type DraftSearchGroup<T> = { representative: T; members: T[] }

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
    const building = values.buildingName || values.premisesName
    const key =
      row.kind === 'address' && building && values.streetName
        ? JSON.stringify([
            building,
            values.premisesName,
            values.streetName,
            values.blockExpression,
            values.phaseExpression,
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
    else groups.push({ key, representative: row, members: [row] })
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
  return groups.map(({ representative, members }) => ({ representative, members }))
}
