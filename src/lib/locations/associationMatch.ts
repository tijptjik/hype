// DOMAIN
import {
  ADDRESS_LOCALES,
  getAddressLocale,
  type FeatureAddress,
} from '#lib/addresses/featureAddress.js'
import { formatStreetNumber } from '#lib/addresses/streetNumber.js'
import { normalizeNameSearch } from '#lib/addresses/nameSearch.js'
import {
  ADDRESS_CHOICE_GROUPS,
  associationNames,
  type AddressChoiceGroup,
} from './associationAddress'
import { locationDistance } from './searchPresentation'
// TYPES
import type { LocaleKey } from '#lib/types.js'
import type { DraftLocationSearchResult as Result } from '#lib/bits/patterns/forms/featureLocation/draftLocationSearch.types.js'

/** Compare meaningful address values, excluding catalogue IDs and empty formatting defaults.
 * @param address Address evidence. @param group Structured component group.
 * @returns Normalized values by language; translation-only enrichment is not a conflict.
 */
function values(
  address: FeatureAddress,
  group: AddressChoiceGroup,
): Record<string, string> {
  return Object.fromEntries(
    Object.keys(ADDRESS_LOCALES).flatMap(locale => {
      const row = getAddressLocale(address, locale as LocaleKey)
      let value: string
      if (group === 'number')
        value = formatStreetNumber(
          String(row.buildingNumberExpression ?? ''),
          String(row.buildingNumberFrom ?? ''),
          String(row.buildingNumberTo ?? ''),
          String(row.buildingNumberConnector ?? '-'),
        )
      else if (group === 'block')
        value =
          String(row.blockExpression || '') ||
          (row.blockRef ? `${row.blockType ?? ''} ${row.blockRef}` : '')
      else if (group === 'phase')
        value =
          String(row.phaseExpression || '') ||
          [row.phaseName, row.phaseRef].filter(Boolean).join(' ')
      else
        value = ADDRESS_CHOICE_GROUPS[group]
          .map(field => row[field])
          .filter(value => typeof value === 'string' && value.trim())
          .join(' ')
      const normalized = normalizeNameSearch(value.replace(/[–—]/g, '-'))
      return normalized ? [[locale, normalized]] : []
    }),
  )
}

/** Identify semantic component differences without comparing storage representation.
 * @param left Original address. @param right Candidate address. @param group Component group.
 * @returns True for conflicting or wholly missing values; extra translations are enrichment.
 */
export function associationGroupDiffers(
  left: FeatureAddress,
  right: FeatureAddress,
  group: AddressChoiceGroup,
): boolean {
  const a = values(left, group),
    b = values(right, group)
  const shared = Object.keys(a).filter(locale => b[locale])
  if (shared.length) return shared.some(locale => a[locale] !== b[locale])
  return JSON.stringify(a) !== JSON.stringify(b)
}

/** Minimum evidence strength that deserves a candidate indicator, not automatic acceptance. */
export const ASSOCIATION_ATTENTION_SCORE = 60

/** Recognize a distinctive contained name without promoting a generic single word.
 * @param left Normalized source name. @param right Normalized candidate name.
 * @returns Whether one name contains the other's complete multiword name or CJK phrase.
 */
function partialName(left: string, right: string): boolean {
  const [short, long] = left.length <= right.length ? [left, right] : [right, left]
  const words = short.split(' ')
  return words.length >= 2
    ? (' ' + long + ' ').includes(' ' + short + ' ')
    : /[\p{Script=Han}]/u.test(short) && short.length >= 4 && long.includes(short)
}

/** Score supporting evidence rather than probability; partial scores never establish identity.
 * @param origin Chosen address or Location. @param row Candidate of the requested kind.
 * @returns Evidence strength out of 100 and a conservative exact-match decision.
 * @remarks Missing fields are unknown, not contradictions. Cross-kind names support discovery,
 * but exact inference still requires the target kind's name, street, number and nearby pin.
 */
export function associationMatch(
  origin: Result,
  row: Result,
): { score: number; exact: boolean } {
  const targetNames = Object.values(
    origin.kind === row.kind
      ? origin.names
      : associationNames(origin.address, row.kind),
  )
    .map(normalizeNameSearch)
    .filter(Boolean)
  const names = [
    ...targetNames,
    ...Object.values(origin.names).map(normalizeNameSearch).filter(Boolean),
  ]
  const candidateNames = Object.values(row.names)
    .map(normalizeNameSearch)
    .filter(Boolean)
  const name = candidateNames.some(value => targetNames.includes(value))
  const equalName = candidateNames.some(value => names.includes(value))
  const partial = candidateNames.some(value =>
    names.some(seed => partialName(seed, value)),
  )
  const street =
    Object.keys(values(origin.address, 'street')).length > 0 &&
    !associationGroupDiffers(origin.address, row.address, 'street')
  const number =
    Object.keys(values(origin.address, 'number')).length > 0 &&
    !associationGroupDiffers(origin.address, row.address, 'number')
  const distance =
    origin.address.coordinates && row.address.coordinates
      ? locationDistance(origin.address.coordinates, row.address.coordinates)
      : Infinity
  // Only overlapping, contradictory values reduce strength; missing details can be inherited.
  const conflicts = (Object.keys(ADDRESS_CHOICE_GROUPS) as AddressChoiceGroup[]).filter(
    group => {
      const left = values(origin.address, group),
        right = values(row.address, group)
      return Object.keys(left).some(
        locale => right[locale] && left[locale] !== right[locale],
      )
    },
  ).length
  const exact =
    name &&
    street &&
    number &&
    distance <= 100 &&
    conflicts === 0 &&
    (Object.keys(ADDRESS_CHOICE_GROUPS) as AddressChoiceGroup[]).every(
      group => !associationGroupDiffers(origin.address, row.address, group),
    )
  if (exact) return { score: 100, exact: true }
  const proximity = distance <= 25 ? 25 : distance <= 50 ? 20 : distance <= 100 ? 10 : 0
  const score =
    (equalName ? 55 : partial ? 45 : 0) +
    proximity +
    (street ? 10 : 0) +
    (number ? 10 : 0) -
    conflicts * 15
  return { score: Math.max(0, Math.min(95, score)), exact: false }
}
