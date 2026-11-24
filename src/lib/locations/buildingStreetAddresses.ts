// VALIDATION
import { z } from 'zod'
// ADDRESS
import { formatStreetNumber, parseStreetNumber } from '#lib/addresses/streetNumber.js'
import type { LocalLocationAddress } from '#lib/addresses/localLocationAddress.js'

// TABLE OF CONTENTS
// 1. Editable street designations and validation
// 2. Canonical content and primary display

export type BuildingStreet = {
  head: string | null
  number: string
  names: Record<string, string>
  priority: number | null
}

const street = z.strictObject({
  head: z.string().min(1).max(200).nullable(),
  number: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine(value => parseStreetNumber(value).valid),
  names: z
    .record(
      z.string().regex(/^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/i),
      z.string().trim().min(1).max(500),
    )
    .refine(names => Object.keys(names).length > 0),
  priority: z.number().int().nonnegative().nullable(),
})
export const BuildingStreetsEditSchema = z
  .strictObject({
    expectedHeads: z.array(z.string().min(1).max(200)),
    rows: z.array(street),
  })
  .refine(({ expectedHeads, rows }) => {
    const heads = rows.flatMap(row => (row.head ? [row.head] : []))
    const addresses = new Set<string>()
    for (const row of rows) {
      for (const [locale, name] of Object.entries(row.names)) {
        const key = JSON.stringify([
          locale.toLowerCase(),
          name.normalize('NFKC').toLowerCase(),
          formatStreetNumber(row.number),
        ])
        if (addresses.has(key)) return false
        addresses.add(key)
      }
    }
    return (
      new Set(expectedHeads).size === expectedHeads.length &&
      new Set(heads).size === heads.length &&
      heads.every(head => expectedHeads.includes(head))
    )
  })
  .refine(value => JSON.stringify(value).length <= 64000)
export type BuildingStreetsEdit = z.infer<typeof BuildingStreetsEditSchema>

/** Read only structured street components, without deriving a range from address choices.
 * @param content Retained address content. @returns Editable number and localized street names.
 */
export function streetFromContent(content: LocalLocationAddress): BuildingStreet {
  const names: Record<string, string> = {}
  let number = ''
  for (const [locale, fields] of Object.entries(content.i18n)) {
    if (!fields.streetName?.trim()) continue
    names[locale.toLowerCase()] = fields.streetName.trim()
    number ||= formatStreetNumber(
      fields.buildingNumberExpression ?? '',
      fields.buildingNumberFrom ?? '',
      fields.buildingNumberTo ?? '',
      fields.buildingNumberConnector ?? '-',
    )
  }
  return { head: null, names, number, priority: null }
}

/** Pick the uniquely best ranked building designation.
 * @param rows Effective authored designations. @returns Selected primary, or undefined for ties and unranked sets.
 */
export function primaryBuildingStreet(
  rows: BuildingStreet[],
): BuildingStreet | undefined {
  const ranked = rows
    .filter(
      (row): row is BuildingStreet & { priority: number } => row.priority !== null,
    )
    .sort((a, b) => a.priority - b.priority)
  return ranked[0]?.priority !== ranked[1]?.priority ? ranked[0] : undefined
}

/** Format the selected street using an available translation of that same street.
 * @param row Authored designation. @param locale Requested content locale. @returns Street address label.
 */
export function buildingStreetLabel(row: BuildingStreet, locale: string): string {
  const tag = [locale.toLowerCase(), 'en', ...Object.keys(row.names)].find(
    key => row.names[key],
  )
  if (!tag) return ''
  const name = row.names[tag]
  return tag.startsWith('zh')
    ? name + row.number + (tag === 'zh-hans' ? '号' : '號')
    : [row.number, name].filter(Boolean).join(' ')
}

/** Materialize a confirmed building-level designation as standard address content.
 * @param row Validated editor row. @returns An independently versionable building address.
 */
export function buildingStreetContent(row: BuildingStreet): LocalLocationAddress {
  const parsed = parseStreetNumber(row.number)
  if (!parsed.valid) throw new Error('Invalid street number')
  const number = parsed.number
  return {
    scope: 'building',
    unit: null,
    unitI18n: {},
    i18n: Object.fromEntries(
      Object.entries(row.names).map(([tag, streetName]) => [
        tag,
        {
          streetName,
          buildingNumberExpression: number.expression,
          buildingNumberFrom: number.from,
          buildingNumberTo: number.to,
          buildingNumberConnector: number.connector,
          formattedAddress: buildingStreetLabel(
            { ...row, number: number.expression },
            tag,
          ),
        },
      ]),
    ),
  }
}
