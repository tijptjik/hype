import proj from 'proj4'
import neighbourhoods from '$lib/map/neighbourhoods.json'
import streetsData from '$lib/map/streets.json'
import type {
  AddressMeta,
  AddressProperties,
  LocaleKey,
  ParsedReverseGeocodeResult,
} from '$lib/types'

type NeighbourhoodI18n = {
  name: string
  neighbourhood: string
  district: string
  area: string
}
type NeighbourhoodEntry = {
  i18n: {
    en: NeighbourhoodI18n
    zhHant?: NeighbourhoodI18n
    zhHans?: NeighbourhoodI18n
  }
}
type Neighbourhoods = Record<string, NeighbourhoodEntry>
type StreetsData = {
  en?: string[]
  zhHant?: string[]
}

const neighbourhoodData = neighbourhoods as Neighbourhoods
const streets = streetsData as StreetsData

// Coordinate system definitions
proj.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs')
proj.defs(
  'EPSG:2326',
  '+proj=tmerc +lat_0=22.31213333333334 +lon_0=114.1785555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +datum=HK80 +units=m +no_defs',
)

// Country mappings
export const countryNormalised: Record<string, Record<LocaleKey, string>> = {
  'Hong Kong': { en: 'HKSAR', zhHant: '香港特區', zhHans: '香港特区' },
}

const countryIdentifiers = {
  HKSAR: [
    'hk',
    'h.k.',
    'hksar',
    'hks.a.r.',
    'hongkong',
    'hongkongsar',
    'hongkongs.a.r.',
    '香港',
    '香港特區',
    '香港特区',
  ],
}

export const getNormalisedCountry = (
  country: keyof typeof countryNormalised,
  locale: LocaleKey = 'en',
): string | null => {
  return countryNormalised[country]?.[locale] || null
}

// Area mappings
const areaNormalised: Record<string, Record<LocaleKey, string>> = {
  'Hong Kong Island': { en: 'HK', zhHant: '香港島', zhHans: '香港岛' },
  Kowloon: { en: 'KL', zhHant: '九龍', zhHans: '九龙' },
  'New Territories': { en: 'NT', zhHant: '新界', zhHans: '新界' },
}

const areaIdentifiers = {
  HK: ['hk', 'hki', 'hongkongisland', 'hongkong', '港島', '香港岛'],
  KL: ['kl', 'kln', 'kwln', 'kowloon', '九龍', '九龙'],
  NT: ['nt', 'ntr', 'newterritories', '新界'],
}

const getNormalisedAreaKey = (area: string): keyof typeof areaNormalised => {
  if (!Object.keys(areaNormalised).includes(area)) {
    area = area.toLowerCase().replace(/ /g, '')
    if (areaIdentifiers.HK.includes(area)) {
      return 'Hong Kong Island'
    } else if (areaIdentifiers.KL.includes(area)) {
      return 'Kowloon'
    } else if (areaIdentifiers.NT.includes(area)) {
      return 'New Territories'
    }
  }
  return area as keyof typeof areaNormalised
}

export const getNormalisedArea = (
  area: keyof typeof areaNormalised,
  locale: LocaleKey = 'en',
): string | null => {
  return areaNormalised[getNormalisedAreaKey(area)]?.[locale] || null
}

// District mappings
const districtNormalised: Record<string, Record<LocaleKey, string>> = {
  'Central & Western': { en: 'CW', zhHant: '中西區', zhHans: '中西区' },
  Eastern: { en: 'EST', zhHant: '東區', zhHans: '东区' },
  Islands: { en: 'ILD', zhHant: '離島區', zhHans: '离岛区' },
  'Kowloon City': { en: 'KLC', zhHant: '九龍城區', zhHans: '九龙城区' },
  'Kwai Tsing': { en: 'KC', zhHant: '葵青區', zhHans: '葵青区' },
  'Kwun Tong': { en: 'KT', zhHant: '觀塘區', zhHans: '观塘区' },
  North: { en: 'NTH', zhHant: '北區', zhHans: '北区' },
  'Sai Kung': { en: 'SK', zhHant: '西貢區', zhHans: '西贡区' },
  'Sha Tin': { en: 'ST', zhHant: '沙田區', zhHans: '沙田区' },
  'Sham Shui Po': { en: 'SSP', zhHant: '深水埗區', zhHans: '深水埗区' },
  Southern: { en: 'STH', zhHant: '南區', zhHans: '南区' },
  'Tai Po': { en: 'TP', zhHant: '大埔區', zhHans: '大埔区' },
  'Tsuen Wan': { en: 'TW', zhHant: '荃灣區', zhHans: '荃湾区' },
  'Tuen Mun': { en: 'TM', zhHant: '屯門區', zhHans: '屯门区' },
  'Wan Chai': { en: 'WC', zhHant: '灣仔區', zhHans: '湾仔区' },
  'Wong Tai Sin': { en: 'WTS', zhHant: '黃大仙區', zhHans: '黄大仙区' },
  'Yau Tsim Mong': { en: 'YTM', zhHant: '油尖旺區', zhHans: '油尖旺区' },
  'Yuen Long': { en: 'YL', zhHant: '元朗區', zhHans: '元朗区' },
}

const districtIdentifiers = {
  CW: [
    'cw',
    'centralandwestern',
    'central&western',
    'centralandwestnerndistrict',
    'central&westnerndistrict',
    '中西區',
    '中西区',
  ],
  EST: ['est', 'eastern', 'eastern', 'easterndistrict', 'eastdistrict', '東區', '东区'],
  ILD: ['ild', 'islands', 'island', 'islandsdistrict', '離島區', '离岛区'],
  KLC: ['klc', 'kowlooncity', 'kowlooncitydistrict', '九龍城區', '九龙城区'],
  KC: ['kc', 'kwaitsing', 'kwaitsingdistrict', '葵青區', '葵青区'],
  KT: ['kt', 'kwuntong', 'kwuntongdistrict', '觀塘區', '观塘区'],
  NTH: ['nth', 'north', 'northdistrict', '北區', '北区'],
  SK: ['sk', 'saikung', 'saikungdistrict', '西貢區', '西贡区'],
  ST: ['st', 'shatin', 'shatindistrict', '沙田區', '沙田区'],
  SSP: ['ssp', 'shamshuipo', 'shamshuipodistrict', '深水埗區', '深水埗区'],
  STH: [
    'sth',
    'south',
    'southern',
    'southdistrict',
    'southerndistrict',
    '南區',
    '南区',
  ],
  TP: ['tp', 'taipo', 'taipodistrict', '大埔區', '大浦区'],
  TW: ['tw', 'tsuenwan', 'tsuenwandistrict', '荃灣區', '荃湾区'],
  TM: ['tm', 'tuenmun', 'tuenmundistrict', '屯門區', '屯门区'],
  WC: ['wc', 'wanchai', 'wanchaidistrict', '灣仔區', '湾仔区'],
  WTS: ['wts', 'wongtaisin', 'wongtaitsindistrict', '黃大仙區', '黄大仙区'],
  YTM: ['ytm', 'yautsimmong', 'yautsimmongdistrict', '油尖旺區', '油尖旺区'],
  YL: ['yl', 'yuenlong', 'yuenlongdistrict', '元朗區', '元朗区'],
}
export const districtCodeToName = {
  CW: 'Central & Western',
  EST: 'Eastern',
  ILD: 'Islands',
  KLC: 'Kowloon City',
  KC: 'Kwai Tsing',
  KT: 'Kwun Tong',
  NTH: 'North',
  SK: 'Sai Kung',
  ST: 'Sha Tin',
  SSP: 'Sham Shui Po',
  STH: 'Southern',
  TP: 'Tai Po',
  TW: 'Tsuen Wan',
  TM: 'Tuen Mun',
  WC: 'Wan Chai',
  WTS: 'Wong Tai Sin',
  YTM: 'Yau Tsim Mong',
  YL: 'Yuen Long',
}

const getNormalisedDistrictKey = (
  district: string,
): keyof typeof districtNormalised => {
  if (!Object.keys(districtNormalised).includes(district)) {
    district = district.toLowerCase().replace(/ /g, '')
    Object.entries(districtIdentifiers).forEach(([key, values]) => {
      if (values.includes(district)) {
        const dCode = districtCodeToName[key as keyof typeof districtCodeToName]
        district = dCode
      }
    })
  }
  return district as keyof typeof districtNormalised
}

export const getNormalisedDistrict = (
  district: keyof typeof districtNormalised,
  locale: LocaleKey = 'en',
): string | null => {
  const normalisedDistrictKey = getNormalisedDistrictKey(district)
  const normalisedDistrict = districtNormalised[normalisedDistrictKey]?.[locale] || null
  return normalisedDistrict
}

// Common address abbreviations
const addressAbbreviations = {
  Road: 'Rd',
  Street: 'St',
  Lane: 'Ln',
  Drive: 'Dr',
  Avenue: 'Ave',
  Place: 'Pl',
  Court: 'Ct',
  Close: 'Cl',
  Crescent: 'Cres',
  Gardens: 'Gdns',
  Heights: 'Hts',
  Mansion: 'Mansion',
  House: 'Hse',
  Building: 'Bldg',
  Tower: 'Tower',
  Centre: 'Ctr',
  Center: 'Ctr',
  Complex: 'Complex',
  Estate: 'Estate',
  Village: 'Village',
  Phase: 'Phase',
  Block: 'Blk',
  Floor: 'F',
  Room: 'Rm',
  Unit: 'Unit',
  Flat: 'Flat',
  Shop: 'Shop',
  Suite: 'St',
}

export function convertWGS84ToHK1980(lng: number, lat: number): [number, number] {
  return proj('EPSG:4326', 'EPSG:2326', [lng, lat])
}

export function convertHK1980ToWGS84(
  easting: number,
  northing: number,
): [number, number] {
  return proj('EPSG:2326', 'EPSG:4326', [easting, northing])
}

export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3 // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return parseInt((R * c).toFixed(0), 10) // Distance in meters
}

export function applyAddressAbbreviations(address: string): string {
  // Apply abbreviations
  Object.entries(addressAbbreviations).forEach(([full, abbrev]) => {
    const regex = new RegExp(`\\b${full}\\b`, 'gi')
    address = address.replace(regex, abbrev)
  })
  return address
}

/**
 * Intermediate parse result used to build ALS lookup queries and local fallback results.
 * This carries parser-only fields that do not belong in the canonical `addressProperties`
 * payload, such as `queryAddress`, `buildingNumbering`, `subpremisesRaw`, and
 * `neighbourhoodRef`.
 */
export type ParsedAddressQueryComponents = {
  queryAddress: string
  streetAddress: string
  streetName: string | null
  premisesName: string | null
  buildingName: string | null
  buildingNumbering: string | null
  buildingNumberFrom: string | null
  buildingNumberTo: string | null
  subpremisesRaw: string | null
  macrohood: string | null
  neighbourhood: string | null
  neighbourhoodRef: string | null
  district: string | null
  area: string | null
  rawAddress: string
  locale: LocaleKey
  addressProperties: Partial<AddressProperties>
}

type SubpremiseComponents = Pick<
  AddressProperties,
  'unitPortion' | 'unitNumber' | 'unitType' | 'floorNumber' | 'floorType'
>

const streetNameSuffixes = [
  'Road',
  'Street',
  'Lane',
  'Drive',
  'Avenue',
  'Place',
  'Terrace',
  'Square',
  'Crescent',
  'Close',
  'Way',
  'Path',
  'Court',
  'Rise',
  'View',
  'Heights',
  'Estate',
  'Centre',
  'Center',
  'Building',
  'Tower',
  'House',
]

const subpremiseIndicators =
  /\b(?:flat|unit|room|suite|shop|office|floor|level|basement|podium|g\/f|lg\/f|ug\/f|b\/f|m\/f|r\/f|\d+\/f)\b/i

const streetKeywords = new RegExp(
  `\\b(${streetNameSuffixes.map(suffix => suffix.toLowerCase()).join('|')})\\b`,
  'i',
)

function normalizeAddressToken(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function getNeighbourhoodI18n(
  entry: NeighbourhoodEntry,
  locale: LocaleKey,
): NeighbourhoodI18n | undefined {
  return entry.i18n[locale] ?? entry.i18n.en
}

function getCanonicalNeighbourhoodNames(locale: LocaleKey): string[] {
  return Object.values(neighbourhoodData)
    .map(entry => getNeighbourhoodI18n(entry, locale)?.name)
    .filter((value): value is string => Boolean(value))
}

function getNeighbourhoodRef(
  neighbourhood: string | null,
  district: string | null,
  locale: LocaleKey,
): string | null {
  if (!neighbourhood) return null

  for (const [ref, entry] of Object.entries(neighbourhoodData)) {
    const localized = getNeighbourhoodI18n(entry, locale)
    if (!localized) continue

    const sameNeighbourhood =
      normalizeAddressToken(localized.name) === normalizeAddressToken(neighbourhood)
    const sameDistrict =
      !district ||
      normalizeAddressToken(localized.district) === normalizeAddressToken(district)

    if (sameNeighbourhood && sameDistrict) return ref
  }

  return neighbourhood
}

function getNeighbourhoodEntryByName(
  neighbourhood: string | null,
  locale: LocaleKey,
): NeighbourhoodEntry | null {
  if (!neighbourhood) return null

  return (
    Object.values(neighbourhoodData).find(entry => {
      const localized = getNeighbourhoodI18n(entry, locale)
      return (
        localized &&
        normalizeAddressToken(localized.name) === normalizeAddressToken(neighbourhood)
      )
    }) ?? null
  )
}

function extractCountryFromAddress(address: string): string | null {
  const segments = address.split(',').map(segment => normalizeAddressToken(segment))
  return segments.some(segment => countryIdentifiers.HKSAR.includes(segment))
    ? 'Hong Kong'
    : null
}

function extractAreaFromAddress(address: string): string | null {
  const segments = address.split(',').map(segment => normalizeAddressToken(segment))

  for (const [area, identifiers] of Object.entries(areaIdentifiers)) {
    if (segments.some(segment => identifiers.includes(segment))) {
      return getNormalisedAreaKey(area as keyof typeof areaIdentifiers)
    }
  }

  return null
}

function extractDistrictFromAddress(address: string): string | null {
  const segments = address.split(',').map(segment => normalizeAddressToken(segment))

  for (const [districtCode, identifiers] of Object.entries(districtIdentifiers)) {
    const districtName =
      districtCodeToName[districtCode as keyof typeof districtCodeToName]
    const normalizedDistrictName = normalizeAddressToken(districtName)
    const hasMatch = segments.some(
      segment => segment === normalizedDistrictName || identifiers.includes(segment),
    )

    if (hasMatch) return districtName
  }

  return null
}

function extractNeighbourhoodFromAddress(
  address: string,
  locale: LocaleKey,
  isSmallToLarge: boolean,
): string | null {
  const segments = address
    .split(',')
    .map(segment => segment.trim())
    .filter(Boolean)
  const searchOrder = isSmallToLarge ? [...segments].reverse() : segments
  const names = getCanonicalNeighbourhoodNames(locale)

  for (const segment of searchOrder) {
    const normalizedSegment = normalizeAddressToken(segment)
    const match = names.find(name =>
      normalizedSegment.includes(normalizeAddressToken(name)),
    )
    if (match) return match
  }

  return null
}

function isEnglishAddressSmallToLarge(address: string): boolean {
  const segments = address.split(',').map(segment => normalizeAddressToken(segment))
  const first = segments[0] ?? ''
  const last = segments.at(-1) ?? ''

  if (
    countryIdentifiers.HKSAR.includes(first) ||
    Object.values(areaIdentifiers).some(values => values.includes(first)) ||
    Object.values(districtIdentifiers).some(values => values.includes(first))
  ) {
    return false
  }

  if (
    countryIdentifiers.HKSAR.includes(last) ||
    Object.values(areaIdentifiers).some(values => values.includes(last)) ||
    Object.values(districtIdentifiers).some(values => values.includes(last))
  ) {
    return true
  }

  return true
}

function isChineseAddressLargeToSmall(address: string): boolean {
  const firstSegment = normalizeAddressToken(address.split(',')[0] ?? '')
  return (
    countryIdentifiers.HKSAR.includes(firstSegment) ||
    Object.values(areaIdentifiers).some(values => values.includes(firstSegment)) ||
    Object.values(districtIdentifiers).some(values => values.includes(firstSegment))
  )
}

function stripAddressComponent(
  address: string,
  matcher: (segment: string) => boolean,
  isAddressLargeToSmall: boolean,
): string {
  const parts = address
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
  const index = isAddressLargeToSmall ? 0 : parts.length - 1
  const candidate = parts[index]

  if (candidate && matcher(normalizeAddressToken(candidate))) {
    parts.splice(index, 1)
    return parts.join(', ')
  }

  return address
}

function removeCountryForQuery(
  address: string,
  isAddressLargeToSmall: boolean,
): string {
  return stripAddressComponent(
    address,
    segment => countryIdentifiers.HKSAR.includes(segment),
    isAddressLargeToSmall,
  )
}

function removeRegionForQuery(address: string, isAddressLargeToSmall: boolean): string {
  return stripAddressComponent(
    address,
    segment => Object.values(areaIdentifiers).some(values => values.includes(segment)),
    isAddressLargeToSmall,
  )
}

function removeDistrictForQuery(
  address: string,
  isAddressLargeToSmall: boolean,
): string {
  return stripAddressComponent(
    address,
    segment =>
      Object.values(districtIdentifiers).some(values => values.includes(segment)),
    isAddressLargeToSmall,
  )
}

function subtractEstateFromAddress(address: string): {
  estateName: string | null
  phaseName: string | null
  phaseNumber: string | null
  blockType: string | null
  blockNumber: string | null
  blockTypeBeforeNumber: boolean | null
  remainingAddress: string
} {
  const parts = address
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
  const estateIndex = parts.findIndex(part =>
    /\b(estate|garden|gardens|court)\b/i.test(part),
  )
  const estateName = estateIndex >= 0 ? parts[estateIndex] : null

  if (estateIndex >= 0) parts.splice(estateIndex, 1)

  const blockPart = parts.find(part =>
    /\b(block|blk|tower|twr)\s*[a-z0-9]+/i.test(part),
  )
  const blockMatch = blockPart?.match(/\b(block|blk|tower|twr)\s*([a-z0-9]+)/i)

  return {
    estateName,
    phaseName: null,
    phaseNumber: null,
    blockType: blockMatch?.[1] ?? null,
    blockNumber: blockMatch?.[2] ?? null,
    blockTypeBeforeNumber: blockMatch ? true : null,
    remainingAddress: parts.join(', '),
  }
}

function subtractPremisesFromAddress(address: string): {
  premisesName: string | null
  remainingAddress: string
} {
  // Strip estate-like segments first so they can act as the premises fallback.
  const estate = subtractEstateFromAddress(address)
  const parts = estate.remainingAddress
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
  const premisesIndex = parts.findIndex(part =>
    /\b(market|mall|plaza|arcade|centre|center|building|tower|house)\b/i.test(part),
  )
  const premisesName = premisesIndex >= 0 ? parts[premisesIndex] : estate.estateName

  if (premisesIndex >= 0) parts.splice(premisesIndex, 1)

  return { premisesName, remainingAddress: parts.join(', ') }
}

function subtractLotFromAddress(address: string): {
  lotType: string | null
  lotNumber: string | null
  remainingAddress: string
} {
  const parts = address
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
  const lotIndex = parts.findIndex(part =>
    /\b(?:lot|dd|rbl|il|kil|nkil|sttl)\b/i.test(part),
  )
  const lotPart = lotIndex >= 0 ? parts[lotIndex] : null
  const lotMatch = lotPart?.match(/\b([a-z]{1,5})\.?\s*(?:lot\s*)?(\d+[a-z]?)\b/i)

  if (lotIndex >= 0) parts.splice(lotIndex, 1)

  return {
    lotType: lotMatch?.[1]?.toUpperCase() ?? null,
    lotNumber: lotMatch?.[2] ?? null,
    remainingAddress: parts.join(', '),
  }
}

function subtractBuildingFromAddress(address: string): {
  buildingName: string | null
  remainingAddress: string
} {
  const parts = address
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
  const buildingIndex = parts.findIndex(part =>
    /\b(building|tower|house|mansion|centre|center)\b/i.test(part),
  )
  const buildingName = buildingIndex >= 0 ? parts[buildingIndex] : null

  if (buildingIndex >= 0) parts.splice(buildingIndex, 1)

  return { buildingName, remainingAddress: parts.join(', ') }
}

function extractSubpremisesFromAddress(address: string): {
  subpremisesRaw: string | null
  remainingAddress: string
} {
  const parts = address
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
  const subpremiseParts: string[] = []
  const remainingParts: string[] = []
  let foundSubpremise = false

  for (const part of parts) {
    const hasStreet = streetKeywords.test(part) || /^\d+[a-z]?\s+\p{L}/iu.test(part)
    const isSubpremise = subpremiseIndicators.test(part) && !hasStreet

    if (isSubpremise) {
      subpremiseParts.push(part)
      foundSubpremise = true
      continue
    }

    if (foundSubpremise) {
      remainingParts.push(part)
      continue
    }

    remainingParts.push(part)
  }

  return {
    subpremisesRaw: subpremiseParts.length > 0 ? subpremiseParts.join(', ') : null,
    remainingAddress: remainingParts.join(', '),
  }
}

function calculateStreetMatchScore(segment: string, locale: LocaleKey): number {
  const streetMatch = getBestStreetNameMatch(segment, locale)
  if (streetMatch) return streetMatch.score

  return streetKeywords.test(segment) ? 0.35 : 0
}

function getBestStreetNameMatch(
  segment: string,
  locale: LocaleKey,
): { streetName: string; score: number } | null {
  const normalizedSegment = normalizeAddressToken(segment)
  const streetNames = locale === 'en' ? (streets.en ?? []) : (streets.zhHant ?? [])

  for (const street of streetNames) {
    const normalizedStreet = normalizeAddressToken(street)
    if (normalizedSegment === normalizedStreet) return { streetName: street, score: 1 }
    if (normalizedSegment.includes(normalizedStreet)) {
      return { streetName: street, score: 0.85 }
    }
    if (normalizedStreet.includes(normalizedSegment)) {
      return { streetName: street, score: 0.6 }
    }
  }

  return null
}

function extractMatchedStreetAddress(segment: string, locale: LocaleKey): string {
  const match = getBestStreetNameMatch(segment, locale)
  if (!match) return segment

  if (locale === 'en') return segment

  const streetIndex = segment.indexOf(match.streetName)
  if (streetIndex === -1) return match.streetName

  const afterStreet = segment.slice(streetIndex + match.streetName.length)
  const buildingNumberMatch = afterStreet.match(
    /^\s*([0-9]+[A-Za-z]*(?:-[0-9]+[A-Za-z]*)?號?)/,
  )
  return `${match.streetName}${buildingNumberMatch?.[1] ?? ''}`
}

function extractStreetFromAddress(
  address: string,
  neighbourhood: string | null,
  locale: LocaleKey,
): { streetAddress: string | null; remainingAddress: string } {
  const segments = address
    .split(/[,;]/)
    .map(segment => segment.trim())
    .filter(Boolean)
  let bestStreetAddress: string | null = null
  let bestStreetIndex = -1
  let bestScore = 0

  segments.forEach((segment, index) => {
    if (
      neighbourhood &&
      normalizeAddressToken(segment).includes(normalizeAddressToken(neighbourhood)) &&
      !streetKeywords.test(segment) &&
      !getBestStreetNameMatch(segment, locale)
    ) {
      return
    }

    const score = calculateStreetMatchScore(segment, locale)
    if (score > bestScore) {
      bestScore = score
      bestStreetAddress = segment
      bestStreetIndex = index
    }
  })

  if (!bestStreetAddress || bestScore < 0.3) {
    return { streetAddress: null, remainingAddress: address }
  }

  return {
    streetAddress: extractMatchedStreetAddress(bestStreetAddress, locale),
    remainingAddress: segments
      .filter((_, index) => index !== bestStreetIndex)
      .join(', '),
  }
}

function parseStreetAddress(
  streetAddress: string | null,
  locale: LocaleKey,
): Pick<
  ParsedAddressQueryComponents,
  'buildingNumberFrom' | 'buildingNumberTo' | 'buildingNumbering' | 'streetName'
> {
  if (!streetAddress) {
    return {
      buildingNumberFrom: null,
      buildingNumberTo: null,
      buildingNumbering: null,
      streetName: null,
    }
  }

  if (locale !== 'en') {
    const match = streetAddress.match(
      /([0-9]+[A-Za-z]*(?:號)?(?:-[0-9]+[A-Za-z]*(?:號)?)*)/,
    )
    const buildingNumbering = match?.[1]?.replace(/號/g, '') ?? null
    const [buildingNumberFrom, buildingNumberTo = null] = buildingNumbering?.split(
      '-',
    ) ?? [null, null]

    return {
      buildingNumberFrom,
      buildingNumberTo,
      buildingNumbering,
      streetName: match ? streetAddress.replace(match[0], '').trim() : streetAddress,
    }
  }

  const streetParts = streetAddress.split(/\s+/)
  let streetStartIndex = 0

  for (let index = 0; index < streetParts.length; index++) {
    const part = streetParts[index]
    const isNumber = /^\d+[a-z]?$/i.test(part)
    const isNumberRange = /^[\d,\-&/a-z]+$/i.test(part) && /\d/.test(part)
    if (!isNumber && !isNumberRange) {
      streetStartIndex = index
      break
    }
  }

  const numberSegment = streetParts.slice(0, streetStartIndex).join(' ')
  const numberMatches = numberSegment.match(/\d+[a-z]?/gi) ?? []
  const buildingNumberFrom = numberMatches[0] ?? null
  const buildingNumberTo =
    numberMatches.length > 1 ? (numberMatches.at(-1) ?? null) : null
  const streetName =
    streetStartIndex > 0 ? streetParts.slice(streetStartIndex).join(' ') : streetAddress

  return {
    buildingNumberFrom,
    buildingNumberTo,
    buildingNumbering: buildingNumberFrom
      ? [buildingNumberFrom, buildingNumberTo].filter(Boolean).join('-')
      : null,
    streetName,
  }
}

function getQueryAddress(
  components: Pick<
    ParsedAddressQueryComponents,
    'premisesName' | 'buildingName' | 'streetAddress' | 'neighbourhood' | 'district'
  >,
): string {
  return Array.from(
    new Set(
      [
        components.premisesName,
        components.buildingName,
        components.streetAddress,
        components.neighbourhood,
        components.district,
      ].filter(Boolean),
    ),
  ).join(', ')
}

export function parseSubPremisesComponent(
  subpremisesRaw: string | null | undefined,
): SubpremiseComponents {
  if (!subpremisesRaw) return {}

  const unitMatch = subpremisesRaw.match(
    /\b(flat|unit|room|suite|shop|office)\s*(?:no\.?\s*)?([a-z0-9][a-z0-9\s,&-]*)/i,
  )
  const floorMatch =
    subpremisesRaw.match(/\b(\d+)\s*\/f\b/i) ||
    subpremisesRaw.match(/\b(?:floor|level)\s*(\d+)\b/i)
  const floorTypeMatch = subpremisesRaw.match(
    /\b(g\/f|lg\/f|ug\/f|b\/f|m\/f|r\/f|podium|basement|roof)\b/i,
  )

  return {
    unitType: unitMatch?.[1] ? titleCase(unitMatch[1]) : undefined,
    unitNumber: unitMatch?.[2]?.trim(),
    unitPortion: unitMatch?.[0]?.trim(),
    floorNumber: floorMatch?.[1],
    floorType: floorTypeMatch?.[1]
      ? floorTypeMatch[1].toUpperCase()
      : floorMatch
        ? 'Floor'
        : undefined,
  }
}

/**
 * Parse an imported address into structured components and an ALS query.
 * @param rawAddress - Address text from the import file.
 * @param locale - Locale for the imported address text.
 * @returns Parsed address components for API geocoding or local fallback storage.
 * @remarks Revives the `feat/data-import` parsing flow while using current
 * normalisation data and locale keys.
 */
export function getAddressForQuery(
  rawAddress: string,
  locale: LocaleKey = 'en',
): ParsedAddressQueryComponents {
  const trimmedAddress = rawAddress.trim()
  const isSmallToLarge =
    locale === 'en'
      ? isEnglishAddressSmallToLarge(trimmedAddress)
      : !isChineseAddressLargeToSmall(trimmedAddress)
  const isLargeToSmall = !isSmallToLarge

  let cleanedAddress = removeCountryForQuery(trimmedAddress, isLargeToSmall)
  cleanedAddress = removeRegionForQuery(cleanedAddress, isLargeToSmall)

  const explicitDistrict = extractDistrictFromAddress(cleanedAddress)
  const explicitRegion = extractAreaFromAddress(trimmedAddress)
  cleanedAddress = removeDistrictForQuery(cleanedAddress, isLargeToSmall)

  const neighbourhood = extractNeighbourhoodFromAddress(
    cleanedAddress,
    locale,
    isSmallToLarge,
  )
  const neighbourhoodEntry = getNeighbourhoodEntryByName(neighbourhood, locale)
  const inferredNeighbourhoodI18n = neighbourhoodEntry
    ? getNeighbourhoodI18n(neighbourhoodEntry, locale)
    : undefined
  const district = explicitDistrict ?? inferredNeighbourhoodI18n?.district ?? null
  const area = explicitRegion ?? inferredNeighbourhoodI18n?.area ?? null
  const macrohood = inferredNeighbourhoodI18n?.neighbourhood ?? null
  const neighbourhoodRef = getNeighbourhoodRef(neighbourhood, district, locale)
  const premises = subtractPremisesFromAddress(cleanedAddress)
  const lot = subtractLotFromAddress(premises.remainingAddress)
  const building = subtractBuildingFromAddress(lot.remainingAddress)
  const subpremises = extractSubpremisesFromAddress(building.remainingAddress)
  const street = extractStreetFromAddress(
    subpremises.remainingAddress,
    neighbourhood,
    locale,
  )
  const parsedStreet = parseStreetAddress(street.streetAddress, locale)
  const premisesName = premises.premisesName
  const addressProperties: Partial<AddressProperties> = {
    rawAddress: trimmedAddress,
    streetAddress: street.streetAddress ?? undefined,
    streetName: parsedStreet.streetName ?? undefined,
    buildingName: building.buildingName ?? undefined,
    buildingNumberFrom: parsedStreet.buildingNumberFrom ?? undefined,
    buildingNumberTo: parsedStreet.buildingNumberTo ?? undefined,
    premisesName: premisesName ?? undefined,
    lotType: lot.lotType ?? undefined,
    lotNumber: lot.lotNumber ?? undefined,
    macrohood: macrohood ?? undefined,
    neighbourhood: neighbourhood ?? undefined,
    district,
    area,
    country: extractCountryFromAddress(trimmedAddress) ?? undefined,
  }
  const queryAddress = getQueryAddress({
    premisesName,
    buildingName: building.buildingName,
    streetAddress: street.streetAddress ?? '',
    neighbourhood,
    district,
  })

  return {
    queryAddress: queryAddress || cleanedAddress,
    streetAddress: street.streetAddress ?? '',
    streetName: parsedStreet.streetName,
    premisesName,
    buildingName: building.buildingName,
    buildingNumbering: parsedStreet.buildingNumbering,
    buildingNumberFrom: parsedStreet.buildingNumberFrom,
    buildingNumberTo: parsedStreet.buildingNumberTo,
    subpremisesRaw: subpremises.subpremisesRaw,
    macrohood,
    neighbourhood,
    neighbourhoodRef,
    district,
    area,
    rawAddress: trimmedAddress,
    locale,
    addressProperties,
  }
}

/**
 * Convert locally parsed address components to the canonical geocode result shape.
 * @param components - Parsed local address components.
 * @returns A geocode-like result marked as locally parsed rather than API matched.
 * @remarks Used when an import row has address content that cannot be sent to ALS.
 */
export function toLocalParseResult(
  components: ParsedAddressQueryComponents,
): ParsedReverseGeocodeResult {
  const parsedSubpremises = parseSubPremisesComponent(components.subpremisesRaw)
  const addressMeta: AddressMeta = {
    addressForwardGeocoder: 'invalid',
    addressForwardGen: false,
  }
  const addressProperties = {
    ...components.addressProperties,
    ...parsedSubpremises,
  }

  return {
    addressMeta,
    i18n: {
      en: {
        displayAddress:
          components.locale === 'en'
            ? components.rawAddress
            : getQueryAddress(components) || undefined,
        displayAddressGen: false,
        addressProperties: components.locale === 'en' ? addressProperties : {},
      },
      zhHant: {
        displayAddress:
          components.locale === 'zhHant' ? components.rawAddress : undefined,
        displayAddressGen: false,
        addressProperties: components.locale === 'zhHant' ? addressProperties : {},
      },
      zhHans: {
        displayAddress:
          components.locale === 'zhHans' ? components.rawAddress : undefined,
        displayAddressGen: false,
        addressProperties: components.locale === 'zhHans' ? addressProperties : {},
      },
    },
  }
}

// export function parseToDisplayAddressEn(address: string, name?: string): string {
//   let result = address;

//   result = applyAddressAbbreviations(result);

//   // Move street numbers to start if they're at the end
//   const numberAtEnd = result.match(/(\d+)\s*$/);
//   if (numberAtEnd) {
//     result = result.replace(/\s*\d+$/, '');
//     result = `${numberAtEnd[1]} ${result}`;
//   }

//   // Add name if provided
//   if (name) {
//     result = `${name}, ${result}`;
//   }

//   return result;
// }

// export function parseToDisplayAddressZh(address: string, name?: string): string {
//   let result = address;
//   // Add name if provided
//   if (name) {
//     result = `${result}${name}`;
//   }

//   return result;
// }

export function capitalizeFirstLetter(str: string): string {
  if (!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export function titleCase(str: string | null | undefined): string {
  if (!str) return ''
  return str.split(' ').map(capitalizeFirstLetter).join(' ')
}

export function getFirstLocation(locations: string): string {
  if (!locations) return ''
  return locations.split(',')[0].trim()
}

export function removeCountry(str: string): string {
  const parts = str.split(',')
  const lastPart = parts.pop()
  if (lastPart && countryNormalised[lastPart.toLowerCase().trim()]) {
    return parts.join(',').trim()
  }
  return str
}

export function removeArea(str: string): string {
  const parts = str.split(',')
  const lastPart = parts.pop()?.trim()

  if (lastPart) {
    const lastPartLower = lastPart.toLowerCase().replace(/\s+/g, '')

    // Check against area identifiers (removing spaces for comparison)
    if (
      areaIdentifiers.HK.includes(lastPartLower) ||
      areaIdentifiers.KL.includes(lastPartLower) ||
      areaIdentifiers.NT.includes(lastPartLower)
    ) {
      return parts.join(',').trim()
    }
  }

  return str
}

export function removeDistrict(str: string): string {
  const parts = str.split(',')
  const lastPart = parts[parts.length - 1]?.trim().toLowerCase()
  // Check if the last part is a district identifier
  if (
    lastPart &&
    Object.values(districtIdentifiers).some(identifiers =>
      identifiers.includes(lastPart.replace(/ /g, '')),
    )
  ) {
    return parts.slice(0, -1).join(',').trim()
  }
  return str
}
