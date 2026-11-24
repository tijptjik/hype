// ADDRESS
import { simplifiedChinese } from '#lib/addresses/simplifiedChinese.js'
import { createLocalLocationAddress } from '#lib/addresses/localLocationAddress.js'
import { parseStreetNumber } from '#lib/addresses/streetNumber.js'
// TYPES
import type { BuildingSource } from './buildingSource'
import type { BuildingDetails } from '#lib/sources/saanseoi.js'

export type PhysicalBuildingMember = {
  names?: Record<string, string>
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
 * @returns Consistent localized names, per-street display ranges and editable address components.
 */
export function physicalBuildingProfile(members: PhysicalBuildingMember[]): {
  names: Record<string, string>
  display: Record<string, string>
  content: ReturnType<typeof createLocalLocationAddress>
} {
  const addresses = members.flatMap(member => member.addresses)
  const locales = new Set(addresses.flatMap(address => Object.keys(address.display)))
  const translations = new Map<string, Set<string>>()
  for (const member of members) {
    for (const [tag, name] of Object.entries(member.names ?? {})) {
      if (!name.trim()) continue
      const names = translations.get(tag) ?? new Set<string>()
      names.add(name.trim())
      translations.set(tag, names)
    }
  }
  const names: Record<string, string> = {}
  for (const [tag, values] of translations)
    if (values.size === 1) names[tag] = [...values][0]
  const content = createLocalLocationAddress()
  const display: Record<string, string> = {}
  content.scope = 'building'
  for (const locale of locales) {
    const streets = new Map<string, { name: string; ends: string[] }>()
    const labels = new Set<string>()
    for (const address of addresses) {
      const street = address.streets?.[locale]
      const number = parseStreetNumber(street?.number ?? '', true)
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
    const singleStreet = streets.size === 1 && !labels.size
    for (const { name, ends } of streets.values()) {
      ends.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      const first = ends[0]
      const last = ends.at(-1)
      const span = first === last ? first : first + '–' + last
      // A single street fits the editable fields. Multiple frontages share only a display label.
      if (singleStreet)
        content.i18n[locale] = {
          formattedAddress: '',
          streetName: name,
          ...(first
            ? {
                buildingNumberFrom: first,
                buildingNumberExpression: first === last ? first : first + '-' + last,
              }
            : {}),
          ...(last && last !== first
            ? { buildingNumberTo: last, buildingNumberConnector: '-' }
            : {}),
        }
      labels.add(
        !span
          ? name
          : locale.startsWith('zh')
            ? name + span + (locale === 'zh-hans' ? '号' : '號')
            : span + ' ' + name,
      )
    }
    if (labels.size) {
      display[locale] = [...labels].join(' · ')
      content.i18n[locale] ??= { formattedAddress: '' }
      content.i18n[locale].formattedAddress = display[locale]
    }
  }
  const traditional = content.i18n['zh-hant']
  if (traditional && !content.i18n['zh-hans']) {
    content.i18n['zh-hans'] = {
      ...traditional,
      formattedAddress: simplifiedChinese(traditional.formattedAddress),
      ...(traditional.streetName
        ? { streetName: simplifiedChinese(traditional.streetName) }
        : {}),
    }
    display['zh-hans'] = content.i18n['zh-hans'].formattedAddress
  }
  for (const [locale, row] of Object.entries(content.i18n))
    if (names[locale] && row.streetName) row.buildingName = names[locale]
  return { names, display, content }
}

/** Format the street ranges retained for a physical building.
 * @param members Reviewed building records. @returns Display labels keyed by locale.
 */
export function physicalBuildingAddresses(
  members: PhysicalBuildingMember[],
): Record<string, string> {
  return physicalBuildingProfile(members).display
}
