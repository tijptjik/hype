// ADDRESS
import { ADDRESS_LOCALES, setAddressOverride } from './featureAddress'
// TYPES
import type { AddressField, FeatureAddress } from './featureAddress'
import type { LocaleKey } from '#lib/types.js'

export const EDITABLE_ADDRESS_FIELDS = [
  'formattedAddress',
  'buildingName',
  'buildingNumberExpression',
  'blockExpression',
  'phaseExpression',
  'premisesName',
  'streetName',
] as const
export type EditableAddressField = (typeof EDITABLE_ADDRESS_FIELDS)[number]
const parsedFields: Partial<Record<EditableAddressField, AddressField[]>> = {
  buildingNumberExpression: [
    'buildingNumberFrom',
    'buildingNumberTo',
    'buildingNumberConnector',
  ],
  blockExpression: ['blockType', 'blockRef', 'blockTypeBeforeNumber'],
  phaseExpression: ['phaseName', 'phaseRef'],
}
const blockTerms = [
  ['Block', '座', '座', 'block'],
  ['Tower', '幢', '幢', 'tower'],
  ['Building', '大廈', '大厦', 'building'],
  ['House', '屋', '屋', 'house'],
  ['Apartment', '閣', '阁', 'apartment'],
  ['Carpark', '停車場', '停车场', 'parking'],
  ['Villa', '別墅', '别墅', 'villa'],
  ['Flat', '室', '室', 'flat'],
  ['Unit', '單位', '单位', 'unit'],
  ['Quarters', '宿舍', '宿舍', 'quarters'],
  ['Garage', '車房', '车房', 'garage'],
] as const

/** Provides a bounded vocabulary for expression completion, while allowing free text.
 * @param field Visible expression. @param locale Editor locale. @returns Localised suggestions.
 */
export function getExpressionSuggestions(
  field: EditableAddressField,
  locale: LocaleKey,
): string[] {
  const index = locale === 'en' ? 0 : locale === 'zhHant' ? 1 : 2
  if (field === 'blockExpression') return blockTerms.map(term => term[index])
  if (field === 'phaseExpression')
    return locale === 'en'
      ? ['Phase 1', 'Phase 2', 'Phase 3', 'Stage 1', 'Stage 2']
      : ['第1期', '第2期', '第3期']
  return []
}

/** Parses an expression without guessing unknown components.
 * @param field Visible expression. @param raw User text. @returns Upstream scalar fields.
 */
export function parseAddressExpression(
  field: EditableAddressField,
  raw: string,
): Partial<Record<AddressField, string | boolean | null>> {
  const value = raw.trim()
  const result: Partial<Record<AddressField, string | boolean | null>> = {
    [field]: value || null,
  }
  for (const key of parsedFields[field] ?? []) result[key] = null
  if (field === 'buildingNumberExpression') {
    const match = /^(\d+[A-Za-z]?)(?:\s*(-|–|—|至|to)\s*(\d+[A-Za-z]?))?$/i.exec(value)
    if (match)
      Object.assign(result, {
        buildingNumberFrom: match[1],
        buildingNumberTo: match[3] ?? null,
        buildingNumberConnector: match[2] ?? null,
      })
  } else if (field === 'blockExpression') {
    const aliases: Record<string, string> = {
      BLK: 'Block',
      BLKS: 'Block',
      TWR: 'Tower',
      BLDG: 'Building',
      HSE: 'House',
      HSES: 'House',
      APT: 'Apartment',
    }
    const expanded = value.replace(
      /^(BLKS?|TWR|BLDG|HSES?|APT)\b/i,
      token => aliases[token.toUpperCase()] ?? token,
    )
    for (const [en, hant, hans, type] of blockTerms) {
      const english = new RegExp(`^(${en})\\s+(.+)$`, 'i').exec(expanded)
      const chinese = new RegExp(`^(.+?)(${hant}|${hans})$`).exec(value)
      if (english || chinese) {
        Object.assign(result, {
          blockType: type,
          blockRef: english?.[2] ?? chinese?.[1],
          blockTypeBeforeNumber: Boolean(english),
        })
        break
      }
    }
  } else if (field === 'phaseExpression') {
    const english = /^(Phase|Stage)\s+([\dIVX]+[A-Z]?)$/i.exec(value)
    const chinese = /^第?([\d一二三四五六七八九十]+)期$/.exec(value)
    if (english || chinese)
      Object.assign(result, {
        phaseName: english?.[1] ?? '期',
        phaseRef: english?.[2] ?? chinese?.[1],
      })
  }
  return result
}

/** Updates an expression and its parsed components together; numbers are language independent.
 * @param address Draft. @param locale Active locale. @param field Visible field.
 * @param value Undefined resets the expression and its components. @returns Updated draft.
 */
export function setAddressExpression(
  address: FeatureAddress,
  locale: LocaleKey,
  field: EditableAddressField,
  value: string | undefined,
): FeatureAddress {
  const locales: LocaleKey[] =
    field === 'buildingNumberExpression' ? ['en', 'zhHant', 'zhHans'] : [locale]
  for (const target of locales) {
    const values =
      value === undefined
        ? Object.fromEntries(
            [field, ...(parsedFields[field] ?? [])].map(key => [key, undefined]),
          )
        : parseAddressExpression(field, value)
    for (const [key, parsed] of Object.entries(values))
      address = setAddressOverride(address, target, key as AddressField, parsed)
  }
  return address
}

/** Reads source-provided division relationships only, without spatial or textual inference.
 * @param address Selected address. @param locale UI locale. @returns Named division memberships, ordered by level with landforms positioned relative to district and area.
 */
export function getAddressDivisions(
  address: FeatureAddress,
  locale: LocaleKey,
): Array<{ id: string; role: string; name: string }> {
  const records = address.source.records as {
    data?: {
      relationships?: {
        divisions?: { data?: Array<{ id: string; meta?: { role?: string } }> }
      }
    }
    included?: Array<{
      type: string
      id: string
      attributes?: {
        level?: number | null
        i18n?: Record<string, { name?: string; displayName?: string }>
      }
    }>
  }
  const divisions = (records.data?.relationships?.divisions?.data ?? [])
    .map(link => {
      const record = records.included?.find(
        item => item.type === 'divisions' && item.id === link.id,
      )
      const text =
        record?.attributes?.i18n?.[ADDRESS_LOCALES[locale]] ??
        record?.attributes?.i18n?.en
      return {
        id: link.id,
        isHongKongIsland: Object.values(record?.attributes?.i18n ?? {}).some(names =>
          [names.name, names.displayName].some(
            name =>
              name === 'Hong Kong Island' || name === '香港島' || name === '香港岛',
          ),
        ),
        level: record?.attributes?.level ?? Number.NEGATIVE_INFINITY,
        role: link.meta?.role ?? '',
        name: text?.name ?? text?.displayName ?? link.id,
      }
    })
    .sort((a, b) => b.level - a.level)

  // Preserve level ordering elsewhere; only landforms move around district and area.
  const ordered = divisions.filter(division => division.role !== 'landform')
  const landforms = divisions.filter(division => division.role === 'landform')
  const ordinaryLandforms = landforms.filter(division => !division.isHongKongIsland)
  const hongKongIsland = landforms.filter(division => division.isHongKongIsland)
  const firstAdministrativeIndex = ordered.findIndex(
    division => division.role === 'district' || division.role === 'area',
  )
  if (firstAdministrativeIndex < 0) {
    return divisions.map(({ id, role, name }) => ({ id, role, name }))
  }
  ordered.splice(firstAdministrativeIndex, 0, ...ordinaryLandforms)
  const districtIndex = ordered.findLastIndex(division => division.role === 'district')
  const areaIndex = ordered.findIndex(division => division.role === 'area')
  ordered.splice(
    districtIndex >= 0 ? districtIndex + 1 : areaIndex,
    0,
    ...hongKongIsland,
  )
  return ordered.map(({ id, role, name }) => ({ id, role, name }))
}

/** Distinguishes fetched membership lists (including empty lists) from missing details.
 * @param address Retained canonical address. @returns Whether the detail response contains memberships.
 */
export function hasAddressDivisionDetails(address: FeatureAddress): boolean {
  const data = address.source.records.data as
    | { relationships?: { divisions?: { data?: unknown } } }
    | undefined
  return Array.isArray(data?.relationships?.divisions?.data)
}
