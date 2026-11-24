// ADDRESS
import { parseStreetNumber } from '#lib/addresses/streetNumber.js'
// TYPES
import type { BuildingSource } from './buildingSource'
import type { BuildingDetails } from '#lib/sources/saanseoi.js'

export type PhysicalBuildingMember = {
  childLocationId?: string
  childRevisionId?: string
  source: BuildingSource
  coordinates: BuildingDetails['coordinates']
  addresses: Array<
    BuildingDetails['addresses'][number] & {
      streets: Record<string, { name: string; number: string }>
    }
  >
}

/** Compose each street's numeric span across the reviewed members, retaining unparsed labels.
 * @param members Published building records explicitly attached to this HYPE identity.
 * @returns Default display addresses keyed by locale.
 */
export function physicalBuildingAddresses(
  members: PhysicalBuildingMember[],
): Record<string, string> {
  const addresses = members.flatMap(member => member.addresses)
  const locales = new Set(addresses.flatMap(address => Object.keys(address.display)))
  const result: Record<string, string> = {}
  for (const locale of locales) {
    const streets = new Map<string, { name: string; ends: string[] }>()
    const labels = new Set<string>()
    for (const address of addresses) {
      const street = address.streets[locale]
      const number = parseStreetNumber(street?.number ?? '')
      if (!street || !number.valid) {
        if (address.display[locale]) labels.add(address.display[locale])
        continue
      }
      const key = street.name.normalize('NFKC').trim().toLowerCase()
      const group = streets.get(key) ?? { name: street.name, ends: [] }
      streets.set(key, group)
      for (const end of [number.number.from, number.number.to])
        if (end) group.ends.push(end)
    }
    for (const { name, ends } of streets.values()) {
      ends.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      const first = ends[0]
      const last = ends.at(-1)
      const span = first === last ? first : first + '–' + last
      labels.add(
        !span
          ? name
          : locale.startsWith('zh')
            ? name + span + (locale === 'zh-hans' ? '号' : '號')
            : span + ' ' + name,
      )
    }
    if (labels.size) result[locale] = [...labels].join(' · ')
  }
  return result
}
