// ADDRESS
import { streetDisplayName } from '#lib/addresses/formatting.js'
import { parseStreetNumber } from '#lib/addresses/streetNumber.js'

type StreetAddress = { street: string; number: string; label: string }
export type LocationGrouping = 'street' | 'district' | 'none'
export type LocationSort = 'number-asc' | 'number-desc' | 'name-asc' | 'name-desc'

type IncludedLocation = {
  id: string
  name: string
  streetAddresses: StreetAddress[]
  districts?: string[]
}
type StreetRow<T> = { item: T; addresses: StreetAddress[] }

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
// Older display-only records can include a building before the numbered street and a district after it.
const streetLine =
  /^(?:(\d+[a-z]?(?:\s*(?:[-–—/&]|to)\s*(?:\d+[a-z]?|[a-z]))?)\s+)?(.+?\s(?:road|street|lane|avenue|drive|way|path|terrace|place|square|crescent|court|close|gardens|hill|highway|circuit|boulevard|rd|st|ln|ave)(?:\s+(?:north|south|east|west|central))?)\.?$/i

/** Read a street from explicit components or a numbered street in a legacy label.
 * @param label Retained display text, possibly containing multiple address lines.
 * @param street Structured street name, when available.
 * @param number Structured building number or range.
 * @returns Address lines with display-only grouping and ordering keys.
 */
export function researchStreetAddresses(
  label: string,
  street = '',
  number = '',
): StreetAddress[] {
  return (label.trim() || [number, street].filter(Boolean).join(' '))
    .split(/\s*[·\n]\s*/)
    .map((line, _, lines) => {
      const matches = line
        .split(/,\s*/)
        .map(part => streetLine.exec(part.trim()))
        .filter(match => match !== null)
      const match = matches.find(part => part[1]) ?? matches[0]
      // A composite display can name a second frontage beyond the primary structured address.
      const useComponents = lines.length === 1 || !match
      const name = (useComponents && street.trim()) || match?.[2] || ''
      const expression = (useComponents && number) || match?.[1] || ''
      const parsed = parseStreetNumber(expression)
      return {
        street: streetDisplayName(name.normalize('NFKC').replace(/\s+/g, ' '), 'en'),
        number: parsed.valid ? parsed.number.expression : '',
        label: line.trim(),
      }
    })
}

/** Order street addresses by their first number, with unnumbered entries last.
 * @param a First address. @param b Second address.
 * @returns Natural street-number order, including suffixes and range ends.
 */
function compareAddresses(a: StreetAddress, b: StreetAddress): number {
  return Number(!a.number) - Number(!b.number) || collator.compare(a.number, b.number)
}

/** Group each Location once per selected section, keeping its identity for every action.
 * @param locations Included session Locations with their effective address choices.
 * @param grouping Street, marker-derived district, or a single flat list.
 * @param sort Row order within each section. A Location's lowest number in that section is its sort key.
 * @returns Alphabetical sections, with unknown groups and unnumbered Locations last.
 */
export function groupResearchLocations<T extends IncludedLocation>(
  locations: T[],
  grouping: LocationGrouping = 'street',
  sort: LocationSort = 'number-asc',
): Array<{ key: string; rows: StreetRow<T>[] }> {
  const groups = new Map<string, StreetRow<T>[]>()
  const direction = sort.endsWith('-desc') ? -1 : 1
  for (const item of locations) {
    const sections = new Map<string, StreetAddress[]>()
    // Each frontage belongs to its own street. Flat and district rows keep every address.
    const addresses = item.streetAddresses.length
      ? item.streetAddresses
      : [{ street: '', number: '', label: '' }]
    for (const address of addresses) {
      const keys =
        grouping === 'street'
          ? [address.street]
          : grouping === 'district' && item.districts?.length
            ? item.districts
            : ['']
      for (const key of keys) {
        const entries = sections.get(key) ?? []
        if (
          !entries.some(
            entry =>
              entry.label === address.label ||
              (address.number &&
                entry.number === address.number &&
                entry.street === address.street),
          )
        ) {
          entries.push(address)
        }
        sections.set(key, entries)
      }
    }
    for (const [key, addresses] of sections) {
      const rows = groups.get(key) ?? []
      rows.push({ item, addresses: addresses.sort(compareAddresses) })
      groups.set(key, rows)
    }
  }
  return [...groups]
    .sort(([a], [b]) => Number(!a) - Number(!b) || collator.compare(a, b))
    .map(([key, rows]) => ({
      key,
      rows: rows.sort((a, b) => {
        const byName = collator.compare(a.item.name, b.item.name)
        if (sort.startsWith('name'))
          return direction * byName || collator.compare(a.item.id, b.item.id)
        const left = a.addresses[0].number
        const right = b.addresses[0].number
        return (
          Number(!left) - Number(!right) ||
          direction * collator.compare(left, right) ||
          byName ||
          collator.compare(a.item.id, b.item.id)
        )
      }),
    }))
}
