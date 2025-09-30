// DATA
import neighbourhoods from '$lib/map/neighbourhoods.json';
import type { Locale } from '$lib/types';
// TYPES
type Neighbourhood = string;
type NeighbourhoodI18n = Record<
  Locale,
  {
    name: string;
    neighbourhood: string;
    district: string;
    region: string;
  }
>;
type Neighbourhoods = Record<Neighbourhood, Record<'i18n', NeighbourhoodI18n>>;

const neighourhoodsJson: Neighbourhoods = neighbourhoods;

// ************
// NORMALISATION :: COUNTRY MAPPINGS
// ************

export const countryNormalised: Record<string, Record<Locale, string>> = {
  HKSAR: { en: 'Hong Kong SAR', 'zh-hant': '香港特區', 'zh-hans': '香港特区' }
};

export const countryIdentifiers = {
  HKSAR: [
    'hksar',
    'hks.a.r.',
    'hongkongsar',
    'hongkongs.a.r.',
    '香港',
    '香港特區',
    '香港特区'
  ]
};

export const getNormalisedCountry = (
  country: keyof typeof countryNormalised,
  locale: Locale = 'en'
): string | null => {
  return countryNormalised[country]?.[locale] || null;
};

export const getNormalisedCountryKey = (country: string): string | null => {
  return 'HKSAR';
};

// ************
// NORMALISATION :: REGION MAPPINGS
// ************

const regionNormalised: Record<string, Record<Locale, string>> = {
  HK: { en: 'Hong Kong Island', 'zh-hant': '香港島', 'zh-hans': '香港岛' },
  KL: { en: 'Kowloon', 'zh-hant': '九龍', 'zh-hans': '九龙' },
  NT: { en: 'New Territories', 'zh-hant': '新界', 'zh-hans': '新界' }
};

export const regionIdentifiers = {
  HK: [
    'hk',
    'h.k.',
    'h.k.i.',
    'hki',
    'hongkongisland',
    'hongkong',
    '港島',
    '香港',
    '香港岛'
  ],
  KL: ['kl', 'kln', 'kwln', 'kowloon', '九龍', '九龙'],
  NT: ['nt', 'n.t.', 'ntr', 'newterritories', '新界']
};

export const getNormalisedRegionKey = (
  region: string
): keyof typeof regionNormalised => {
  if (!Object.keys(regionNormalised).includes(region)) {
    const normalizedRegion = region.toLowerCase().replace(/ /g, '');
    for (const [key, values] of Object.entries(regionIdentifiers)) {
      if (values.includes(normalizedRegion)) {
        return key as keyof typeof regionNormalised;
      }
    }
  }
  return region as keyof typeof regionNormalised;
};

export const getNormalisedRegion = (
  region: keyof typeof regionNormalised,
  locale: Locale = 'en'
): string | null => {
  return regionNormalised[getNormalisedRegionKey(region)]?.[locale] || null;
};

export const regionToCountry = {
  HK: 'HKSAR',
  KL: 'HKSAR',
  NT: 'HKSAR'
};

// ************
// NORMALISATION :: DISTRICT MAPPINGS
// ************

export const districtNormalised: Record<string, Record<Locale, string>> = {
  CW: { en: 'Central & Western', 'zh-hant': '中西區', 'zh-hans': '中西区' },
  EST: { en: 'Eastern', 'zh-hant': '東區', 'zh-hans': '东区' },
  ILD: { en: 'Islands', 'zh-hant': '離島區', 'zh-hans': '离岛区' },
  KLC: { en: 'Kowloon City', 'zh-hant': '九龍城區', 'zh-hans': '九龙城区' },
  KC: { en: 'Kwai Tsing', 'zh-hant': '葵青區', 'zh-hans': '葵青区' },
  KT: { en: 'Kwun Tong', 'zh-hant': '觀塘區', 'zh-hans': '观塘区' },
  NTH: { en: 'North', 'zh-hant': '北區', 'zh-hans': '北区' },
  SK: { en: 'Sai Kung', 'zh-hant': '西貢區', 'zh-hans': '西贡区' },
  ST: { en: 'Sha Tin', 'zh-hant': '沙田區', 'zh-hans': '沙田区' },
  SSP: { en: 'Sham Shui Po', 'zh-hant': '深水埗區', 'zh-hans': '深水埗区' },
  STH: { en: 'Southern', 'zh-hant': '南區', 'zh-hans': '南区' },
  TP: { en: 'Tai Po', 'zh-hant': '大埔區', 'zh-hans': '大埔区' },
  TW: { en: 'Tsuen Wan', 'zh-hant': '荃灣區', 'zh-hans': '荃湾区' },
  TM: { en: 'Tuen Mun', 'zh-hant': '屯門區', 'zh-hans': '屯门区' },
  WC: { en: 'Wan Chai', 'zh-hant': '灣仔區', 'zh-hans': '湾仔区' },
  WTS: { en: 'Wong Tai Sin', 'zh-hant': '黃大仙區', 'zh-hans': '黄大仙区' },
  YTM: { en: 'Yau Tsim Mong', 'zh-hant': '油尖旺區', 'zh-hans': '油尖旺区' },
  YL: { en: 'Yuen Long', 'zh-hant': '元朗區', 'zh-hans': '元朗区' }
};

export const districtionToRegion = {
  CW: 'HK',
  EST: 'HK',
  ILD: 'NT',
  KLC: 'KL',
  KC: 'NT',
  KT: 'KL',
  NTH: 'NT',
  SK: 'NT',
  ST: 'NT',
  SSP: 'KL',
  STH: 'HK',
  TP: 'NT',
  TW: 'NT',
  TM: 'NT',
  WC: 'HK',
  WTS: 'KL',
  YTM: 'KL',
  YL: 'NT'
};

export const districtIdentifiers = {
  CW: [
    'cw',
    'centralandwestern',
    'central&western',
    'centralandwesterndistrict',
    'central&westerndistrict',
    '中西區',
    '中西区'
  ],
  EST: ['est', 'eastern', 'eastern', 'easterndistrict', 'eastdistrict', '東區', '东区'],
  ILD: ['il', 'ild', 'islands', 'island', 'islandsdistrict', '離島區', '离岛区'],
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
    '南区'
  ],
  TP: ['tp', 'taipo', 'taipodistrict', '大埔區', '大浦区'],
  TW: ['tw', 'tsuenwan', 'tsuenwandistrict', '荃灣區', '荃湾区'],
  TM: ['tm', 'tuenmun', 'tuenmundistrict', '屯門區', '屯门区'],
  WC: ['wc', 'wanchai', 'wanchaidistrict', '灣仔區', '湾仔区'],
  WTS: ['wts', 'wongtaisin', 'wongtaisindistrict', '黃大仙區', '黄大仙区'],
  YTM: ['ytm', 'yautsimmong', 'yautsimmongdistrict', '油尖旺區', '油尖旺区'],
  YL: ['yl', 'yuenlong', 'yuenlongdistrict', '元朗區', '元朗区']
};

export const getNormalisedDistrictKey = (
  district: string
): keyof typeof districtNormalised => {
  console.log('🗺️ getNormalisedDistrictKey:', district);
  if (!Object.keys(districtNormalised).includes(district)) {
    const normalizedDistrict = district.toLowerCase().replace(/ /g, '');
    console.log(
      '🗺️ getNormalisedDistrictKey: Normalized district:',
      normalizedDistrict
    );
    for (const [key, values] of Object.entries(districtIdentifiers)) {
      if (values.includes(normalizedDistrict)) {
        return key as keyof typeof districtNormalised;
      }
    }
  }
  return district as keyof typeof districtNormalised;
};

export const getNormalisedDistrict = (
  district: keyof typeof districtNormalised | null,
  locale: Locale = 'en'
): string | null => {
  if (!district) return null;
  const normalisedDistrictKey = getNormalisedDistrictKey(district);
  const normalisedDistrict =
    districtNormalised[normalisedDistrictKey]?.[locale] || null;
  return normalisedDistrict;
};

// ************
// NORMALISATION :: NEIGHBOURHOODS
// ************

const neighbourhoodKeys = Object.keys(neighourhoodsJson);

function getCanonicalSubNeighbourhoods(): Neighbourhood[] {
  return Object.values(neighourhoodsJson).map((n) => n.i18n.en.name);
}

function getCanonicalSubNeighbourhoodsZh(): Neighbourhood[] {
  return Object.values(neighourhoodsJson).map((n) => n.i18n['zh-hant'].name);
}

function getCanonicalNeighbourhoods(): Neighbourhood[] {
  return Array.from(
    new Set(Object.values(neighourhoodsJson).map((n) => n.i18n.en.neighbourhood))
  );
}

function getCanonicalDistricts(): string[] {
  return Array.from(
    new Set(Object.values(neighourhoodsJson).map((n) => n.i18n.en.district))
  );
}

// Handle disambiguation of neighbourhoods with the same name, e.g. Ping Shan in Kwun Tong vs Yuen Long
export function getKeyFromSubNeighbourhoodAndDistrict(
  name: string,
  district: string
): Neighbourhood {
  if (neighbourhoodKeys.includes(`${name}, ${district}`)) {
    return `${name}, ${district}`;
  }

  return name;
}

export const canonicalNeighbourhoodRefs = Object.keys(
  neighourhoodsJson
) as Neighbourhood[];
export const canonicalSubNeighbourhoods = getCanonicalSubNeighbourhoods();
export const canonicalSubNeighbourhoodsZh = getCanonicalSubNeighbourhoodsZh();
export const canonicalNeighbourhoods = getCanonicalNeighbourhoods();
export const canonicalDistricts = getCanonicalDistricts();

export const getDistrictFromNeighbourhoodRef = (
  neighbourhoodRef: Neighbourhood,
  locale: Locale = 'en'
): string | null => {
  return neighourhoodsJson[neighbourhoodRef].i18n[locale].district || null;
};

export const commonNeighbourhoodAbbreviations = {
  CWB: 'Causeway Bay',
  // KT: 'Kwun Tong', // Kowloon Tong
  KB: 'Kowloon Bay',
  MK: 'Mong Kok',
  NP: 'North Point',
  PE: 'Prince Edward',
  POHO: 'Po Hing Fong',
  SS: 'Sheung Shui',
  SK: 'Sai Kung',
  SKW: 'So Ku Wan',
  TKT: 'Tai Kok Tsui',
  SOHO: 'SOHO',
  SOK: 'Sok Kwu Wan',
  SSP: 'Sham Shui Po',
  ST: 'Sha Tin',
  SW: 'Sheung Wan',
  SYP: 'Sai Ying Pun',
  TKO: 'Tseung Kwan O',
  TST: 'Tsim Sha Tsui',
  YLP: 'Yau Leng Ping',
  YMT: 'Yau Ma Tei',
  'The Peak': 'Peak',
  'Victoria Peak': 'Peak',
  'Tong Chung': 'Tung Chung'
};

/**
 * Get the district from a neighbourhood reference
 * @param neighbourhood - The neighbourhood reference to get the district from (e.g. Mong Kok, Ping Shan)
 * @param locale - The locale to get the district for
 * @param discriminant - The district discriminator (code) to get the district for (optional) - used to disambiguate neighbourhoods with the same name, e.g. Ping Shan, KT vs Ping Shan, YL
 * @returns The district, or null if the neighbourhood reference is not found
 */
export function getDistrictFromNeighbourhood(
  neighbourhood: string | null,
  locale: Locale = 'en',
  discriminant?: string | null
): string | null {
  if (!neighbourhood) return null;
  let neighbourhoodRef = discriminant
    ? `${neighbourhood}, ${discriminant}`
    : neighbourhood;
  // Canonical neighbourhood names
  neighbourhood =
    canonicalNeighbourhoodRefs.find(
      (n) => n.toLowerCase() === neighbourhoodRef.toLowerCase()
    ) || null;
  return neighbourhood
    ? getDistrictFromNeighbourhoodRef(neighbourhoodRef, locale)
    : null;
}

// ************
// NORMALISATION :: STREET ADDRESSES
// ************

export const nonUniqueStreetNames = {
  en: [
    'Cheung Shing Street',
    'Luen On Street',
    'Lung Tak Street',
    'Market Street',
    'Ping On Lane',
    'San Lau Street',
    'Tai Yuen Street',
    'Wiltshire Road',
    'Wing Lee Street',
    'Wing Lung Street',
    'Wing Yip Street',
    'Wo Fung Street'
  ],
  'zh-hant': [
    '聯發街',
    '聯興街',
    '聯安街',
    '街市街',
    '平安里',
    '新安街',
    '新村街',
    '崇德街',
    '大學道',
    '永利街',
    '永隆街'
  ]
};

// Common address abbreviations
export const streetnameAbbreviations = {
  Road: 'Rd',
  Street: 'St',
  Lane: 'Ln'
  // Drive: 'Drive',
  // Avenue: 'Avenue',
  // Place: 'Place',
  // Court: 'Court',
  // Close: 'Close',
  // Crescent: 'Crescent',
};

export const buildingAbbreviations = {
  House: 'Hse',
  Building: 'Bldg',
  // Tower: 'Tower',
  Centre: 'Ctr',
  Center: 'Ctr'
  // Complex: 'Complex',
  // Estate: 'Estate',
  // Village: 'Village',
  // Phase: 'Phase',
};

// Define directional tokens (both full words and abbreviations)
export const directionalTokens = [
  'east',
  'west',
  'north',
  'south',
  'central',
  'upper',
  'lower',
  'e',
  'w',
  'n',
  's',
  'upp',
  'low',
  'lwr'
];

export function reverseApplyAddressAbbreviations(address: string): string {
  if (!address || address.trim() === '') {
    return address;
  }

  const segments = address.trim().split(/\s+/);
  if (segments.length === 0) {
    return address;
  }

  // Define street suffix abbreviations and their expansions
  const streetSuffixAbbreviations = {
    rd: 'Road',
    str: 'Street',
    dr: 'Drive',
    cl: 'Close',
    crt: 'Court',
    ln: 'Lane',
    ave: 'Avenue',
    st: 'Street',
    blvd: 'Boulevard',
    pkwy: 'Parkway',
    pl: 'Place',
    sq: 'Square',
    ter: 'Terrace',
    way: 'Way',
    cres: 'Crescent'
  };

  // Define directional abbreviations and their full expansions
  const directionalAbbreviations = {
    e: 'East',
    w: 'West',
    n: 'North',
    s: 'South',
    c: 'Central',
    u: 'Upper',
    l: 'Lower'
  };

  let targetSegmentIndex = segments.length - 1;
  let hasDirectionalToken = false;

  // Check if last segment is a directional token
  const lastSegment = segments[segments.length - 1].toLowerCase();
  if (directionalTokens.includes(lastSegment)) {
    hasDirectionalToken = true;
    // If there's a second-to-last segment, target that for street suffix expansion
    if (segments.length > 1) {
      targetSegmentIndex = segments.length - 2;
    } else {
      // Only one segment and it's directional, just expand the directional
      const expandedDirection =
        directionalAbbreviations[lastSegment] || segments[segments.length - 1];
      segments[segments.length - 1] = expandedDirection;
      return segments.join(' ');
    }
  }

  // Check target segment for street suffix abbreviation
  const targetSegment = segments[targetSegmentIndex].toLowerCase();
  if (streetSuffixAbbreviations[targetSegment]) {
    segments[targetSegmentIndex] = streetSuffixAbbreviations[targetSegment];
  }

  // If we found a directional token, expand it
  if (hasDirectionalToken) {
    const directionalSegment = segments[segments.length - 1].toLowerCase();
    if (directionalAbbreviations[directionalSegment]) {
      segments[segments.length - 1] = directionalAbbreviations[directionalSegment];
    }
  }

  return segments.join(' ');
}

export const commonStreetNameSuffixes = [
  'road',
  'street',
  'lane',
  'drive',
  'avenue',
  'rd',
  'st',
  'ln',
  'dr',
  'ave'
];

export const streetNameSuffixes = [
  'aberdeen',
  'alley',
  'approach',
  'au',
  'avenue',
  'bay',
  'bazaar',
  'boulevard',
  'bridge',
  'broadway',
  'bypass',
  'central',
  'chau',
  'chung',
  'circuit',
  'close',
  'corridor',
  'court',
  'crescent',
  'drive',
  'e',
  'east',
  'embankment',
  'en',
  'flyover',
  'fong',
  'glenealy',
  'ha',
  'hang',
  'heights',
  'highway',
  'hill',
  'hui',
  'incline',
  'interchange',
  'junction',
  'kau',
  'kiu',
  'lam',
  'lane',
  'lingnan',
  'link',
  'ln',
  'long',
  'mall',
  'mi',
  'n',
  'north',
  'path',
  'pathway',
  'place',
  'po',
  'promenade',
  'quadrant',
  'queensway',
  'rd',
  'ride',
  'rise',
  'road',
  'row',
  's',
  'shan',
  'shui',
  'smithfield',
  'south',
  'square',
  'st',
  'steps',
  'strand',
  'street',
  'tau',
  'tei',
  'terrace',
  'tin',
  'town',
  'tsai',
  'tseng',
  'tung',
  'tunnel',
  'twisk',
  'view',
  'w',
  'wai',
  'walk',
  'wan',
  'wat',
  'west',
  'wo',
  'yard'
];

// ************
// NORMALISATION :: ESTATE
// ************

export const estateAbbreviations = {
  block: 'Blk',
  unit: 'Unit',
  estate: 'Estate',
  phase: 'Ph',
  tower: 'Twr'
};

export const estateNames = [
  'Ap Lei Chau Estate',
  'Butterfly Estate',
  'Chai Wan Estate',
  'Chak On Estate',
  'Cheung Ching Estate',
  'Cheung Fat Estate',
  'Cheung Hang Estate',
  'Cheung Hong Estate',
  'Cheung Kwai Estate',
  'Cheung Lung Wai Estate',
  'Cheung On Estate',
  'Cheung Sha Wan Estate',
  'Cheung Shan Estate',
  'Cheung Wah Estate',
  'Cheung Wang Estate',
  'Ching Ho Estate',
  'Ching Tin Estate',
  'Choi Fai Estate',
  'Choi Fook Estate',
  'Choi Ha Estate',
  'Choi Hung Estate',
  'Choi Ming Court',
  'Choi Tak Estate',
  'Choi Wan (2) Estate',
  'Choi Wan (I) Estate',
  'Choi Ying Estate',
  'Choi Yuen Estate',
  'Chuk Yuen (North) Estate',
  'Chuk Yuen South Estate',
  'Chun Shek Estate',
  'Chun Yeung Estate',
  'Chung On Estate',
  'Easeful Court',
  'Fai Ming Estate',
  'Fortune Estate',
  'Fu Cheong Estate',
  'Fu Heng Estate',
  'Fu Shan Estate',
  'Fu Shin Estate',
  'Fu Tai Estate',
  'Fu Tip Estate',
  'Fu Tung Estate',
  'Fuk Loi Estate',
  'Fung Tak Estate',
  'Fung Wah Estate',
  'Fung Wo Estate',
  'Grandeur Terrace',
  'Hau Tak Estate',
  'Heng On Estate',
  'High Prosperity Terrace',
  'Hin Fat Estate',
  'Hin Keng Estate',
  'Hin Yiu Estate',
  'Hing Man Estate',
  'Hing Tin Estate',
  'Hing Tung Estate',
  'Hing Wah (1) Estate',
  'Hing Wah (2) Estate',
  'Ho Man Tin Estate',
  'Hoi Fu Court',
  'Hoi Lai Estate',
  'Hoi Tat Estate',
  'Hoi Ying Estate',
  'Hong Tung Estate',
  'Hung Fuk Estate',
  'Hung Hom Estate',
  'Ka Fuk Estate',
  'Kai Ching Estate',
  'Kai Chuen Court',
  'Kai Tin Estate',
  'Kai Yip Estate',
  'Kam Peng Estate',
  'Kin Ming Estate',
  'Kin Sang Estate',
  'King Lam Estate',
  'Ko Cheung Court',
  'Ko Yee Estate',
  'Kwai Chung Estate',
  'Kwai Fong Estate',
  'Kwai Hing Estate',
  'Kwai Luen Estate',
  'Kwai Shing East Estate',
  'Kwai Shing West Estate',
  'Kwai Tsui Estate',
  'Kwong Fuk Estate',
  'Kwong Tin Estate',
  'Kwong Yuen Estate',
  'Lai King Estate',
  'Lai Kok Estate',
  'Lai On Estate',
  'Lai Tsui Court',
  'Lai Yiu Estate',
  'Lam Tin Estate',
  'Lee On Estate',
  'Lei Cheng Uk Estate',
  'Lei Muk Shue (1) Estate',
  'Lei Muk Shue (2) Estate',
  'Lei Muk Shue Estate',
  'Lei Tung Estate',
  'Lei Yue Mun Estate',
  'Lek Yuen Estate',
  'Leung King Estate',
  'Lin Tsui Estate',
  'Lok Fu Estate',
  'Lok Wah North Estate',
  'Lok Wah South Estate',
  'Long Ching Estate',
  'Long Ping Estate',
  'Long Shin Estate',
  'Lower Ngau Tau Kok Estate',
  'Lower Wong Tai Sin (1) Estate',
  'Lower Wong Tai Sin (2) Estate',
  'Lung Hang Estate',
  'Lung Tin Estate',
  'Lung Yat Estate',
  'Ma Hang Estate',
  'Ma Tau Wai Estate',
  'Mei Lam Estate',
  'Mei Tin Estate',
  'Mei Tung Estate',
  'Ming Tak Estate',
  'Model Housing Estate',
  'Mun Tung Estate',
  'Nam Cheong Estate',
  'Nam Shan Estate',
  'Nga Ning Court',
  'Ngan Wan Estate',
  'Oi Man Estate',
  'Oi Tung Estate',
  'On Tai Estate',
  'On Tat Estate',
  'On Tin Estate',
  'On Ting Estate',
  'On Yam Estate',
  'Pak Tin Estate',
  'Ping Shek Estate',
  'Ping Tin Estate',
  'Po Heung Estate',
  'Po Lam Estate',
  'Po Shek Wu Estate',
  'Po Tat Estate',
  'Po Tin Estate',
  'Pok Hong Estate',
  'Queens Hill Estate',
  'Sai Wan Estate',
  'Sam Shing Estate',
  'Sau Mau Ping (South) Estate',
  'Sau Mau Ping Estate',
  'Sha Kok Estate',
  'Shan King Estate',
  'Shatin Pass Estate',
  'Shek Kip Mei Estate',
  'Shek Lei (I) Estate',
  'Shek Lei (II) Estate',
  'Shek Mun Estate',
  'Shek Pai Wan Estate',
  'Shek Wai Kok Estate',
  'Shek Yam East Estate',
  'Shek Yam Estate',
  'Sheung Lok Estate',
  'Sheung Tak Estate',
  'Shin Ming Estate',
  'Shui Chuen O Estate',
  'Shui Pin Wai Estate',
  'Shun Lee Estate',
  'Shun On Estate',
  'Shun Tin Estate',
  'Siu Sai Wan Estate',
  'So Uk Estate',
  'Sun Chui Estate',
  'Sun Tin Wai Estate',
  'Tai Hang Tung Estate',
  'Tai Hing Estate',
  'Tai Ping Estate',
  'Tai Wo Estate',
  'Tai Wo Hau Estate',
  'Tai Yuen Estate',
  'Tak Long Estate',
  'Tak Tin Estate',
  'Tin Chak Estate',
  'Tin Ching Estate',
  'Tin Heng Estate',
  'Tin King Estate',
  'Tin Ping Estate',
  'Tin Shui (1) Estate',
  'Tin Shui (2) Estate',
  'Tin Tsz Estate',
  'Tin Wah Estate',
  'Tin Wan Estate',
  'Tin Yan Estate',
  'Tin Yat Estate',
  'Tin Yiu (1) Estate',
  'Tin Yiu (2) Estate',
  'Tin Yuet Estate',
  'Tsing Yi Estate',
  'Tsui Lam Estate',
  'Tsui Lok Estate',
  'Tsui Ping (North) Estate',
  'Tsui Ping (South) Estate',
  'Tsui Wan Estate',
  'Tsz Ching Estate',
  'Tsz Hong Estate',
  'Tsz Lok Estate',
  'Tsz Man Estate',
  'Tung Tau (II) Estate',
  'Tung Wui Estate',
  'Un Chau Estate',
  'Upper Ngau Tau Kok Estate',
  'Upper Wong Tai Sin Estate',
  'Wah Fu (I) Estate',
  'Wah Fu (II) Estate',
  'Wah Ha Estate',
  'Wah Kwai Estate',
  'Wah Lai Estate',
  'Wah Ming Estate',
  'Wah Sum Estate',
  'Wan Hon Estate',
  'Wan Tau Tong Estate',
  'Wan Tsui Estate',
  'Wang Tau Hom Estate',
  'Wing Cheong Estate',
  'Wo Che Estate',
  'Wo Lok Estate',
  'Wo Tin Estate',
  'Wu King Estate',
  'Yan On Estate',
  'Yan Tin Estate',
  'Yat Tung (1) Estate',
  'Yat Tung (2) Estate',
  'Yau Lai Estate',
  'Yau Oi Estate',
  'Yau Tong Estate',
  'Yee Ming Estate',
  'Ying Tung Estate',
  'Yip Wong Estate',
  'Yiu On Estate',
  'Yiu Tung Estate',
  'Yue Wan Estate',
  'Yung Shing Court'
];

export const estateNamesAlt = [
  'Choi Wan (II) Estate',
  'Choi Wan (1) Estate',
  'Hing Wah (I) Estate',
  'Hing Wah (II) Estate',
  'Lei Muk Shue (I) Estate',
  'Lei Muk Shue (II) Estate',
  'Lower Wong Tai Sin (I) Estate',
  'Lower Wong Tai Sin (II) Estate',
  'Shek Lei (1) Estate',
  'Shek Lei (2) Estate',
  'Tin Shui (I) Estate',
  'Tin Shui (II) Estate',
  'Tin Yiu (I) Estate',
  'Tin Yiu (II) Estate',
  'Tung Tau (1) Estate',
  'Tung Tau (2) Estate',
  'Tung Tau (I) Estate',
  'Wah Fu (1) Estate',
  'Wah Fu (2) Estate',
  'Yat Tung (I) Estate',
  'Yat Tung (II) Estate'
];

export const estateNamesEn = [
  ...estateNames,
  ...estateNamesAlt
];

// ************
// NORMALISATION :: PREMISES
// ************

const subPremisesAbbreviations = {
  Room: 'Rm',
  Unit: 'Unit',
  Block: 'Blk',
  Flat: 'Flat',
  Shop: 'Shop',
  Suite: 'St'
};

export const unitTypeAbbreviations = {
  room: 'Rm',
  unit: 'Unit',
  flat: 'Flat',
  shop: 'Shop',
  suite: 'St'
};

export const unitPortionAbbreviations = {
  front: 'Front',
  rear: 'Rear',
  side: 'Side',
  roof: 'Roof'
};

export const floorTypeAbbreviations = {
  B: 'Basement',
  C: 'Concourse',
  CP: 'Car Park',
  L: 'Level',
  G: 'Ground',
  LG: 'Lower Ground',
  LP: 'Lower Parking',
  M: 'Mezzanine',
  P: 'Parking',
  PR: 'Pantry',
  R: 'Roof',
  T: 'Terrace',
  U: 'Upper',
  UG: 'Upper Ground'
};

// ************
// NORMALISATION :: I18N DICTIONARIES
// ************

export const unitTypeI18n: Record<string, Record<Locale, string>> = {
  room: {
    en: 'Room',
    'zh-hant': '室',
    'zh-hans': '室'
  },
  unit: {
    en: 'Unit',
    'zh-hant': '單位',
    'zh-hans': '单位'
  },
  flat: {
    en: 'Flat',
    'zh-hant': '單位',
    'zh-hans': '单位'
  },
  shop: {
    en: 'Shop',
    'zh-hant': '舖',
    'zh-hans': '铺'
  },
  suite: {
    en: 'Suite',
    'zh-hant': '室',
    'zh-hans': '室'
  },
  office: {
    en: 'Office',
    'zh-hant': '辦公室',
    'zh-hans': '办公室'
  },
  block: {
    en: 'Block',
    'zh-hant': '座',
    'zh-hans': '座'
  }
};

export const floorTypeI18n: Record<string, Record<Locale, string>> = {
  B: {
    en: 'Basement',
    'zh-hant': '地庫',
    'zh-hans': '地库'
  },
  C: {
    en: 'Concourse',
    'zh-hant': '大堂',
    'zh-hans': '大堂'
  },
  CP: {
    en: 'Car Park',
    'zh-hant': '停車場',
    'zh-hans': '停车场'
  },
  L: {
    en: 'Level',
    'zh-hant': '樓層',
    'zh-hans': '楼层'
  },
  G: {
    en: 'Ground',
    'zh-hant': '地下',
    'zh-hans': '地下'
  },
  LG: {
    en: 'Lower Ground',
    'zh-hant': '低層',
    'zh-hans': '低层'
  },
  LP: {
    en: 'Lower Parking',
    'zh-hant': '低層停車場',
    'zh-hans': '低层停车场'
  },
  M: {
    en: 'Mezzanine',
    'zh-hant': '夾層',
    'zh-hans': '夹层'
  },
  P: {
    en: 'Parking',
    'zh-hant': '停車場',
    'zh-hans': '停车场'
  },
  PA: {
    en: 'Pantry',
    'zh-hant': '茶水間',
    'zh-hans': '茶水间'
  },
  PR: {
    en: 'Parking Ramp',
    'zh-hant': '停車場',
    'zh-hans': '停车场'
  },
  R: {
    en: 'Roof',
    'zh-hant': '天台',
    'zh-hans': '天台'
  },
  T: {
    en: 'Terrace',
    'zh-hant': '平台',
    'zh-hans': '平台'
  },
  U: {
    en: 'Upper',
    'zh-hant': '高層',
    'zh-hans': '高层'
  },
  UG: {
    en: 'Upper Ground',
    'zh-hant': '高層',
    'zh-hans': '高层'
  },
  F: {
    en: 'Floor',
    'zh-hant': '樓',
    'zh-hans': '楼'
  }
};

export const unitPortionI18n: Record<string, Record<Locale, string>> = {
  front: {
    en: 'Front',
    'zh-hant': '前',
    'zh-hans': '前'
  },
  rear: {
    en: 'Rear',
    'zh-hant': '後',
    'zh-hans': '后'
  },
  side: {
    en: 'Side',
    'zh-hant': '側',
    'zh-hans': '侧'
  },
  roof: {
    en: 'Roof',
    'zh-hant': '天台',
    'zh-hans': '天台'
  }
};

/**
 * Get the standardized unit type in the target locale
 */
export function getStandardizedUnitType(
  unitType: string,
  targetLocale: Locale = 'en'
): string | null {
  const normalizedType = unitType.toLowerCase();
  return unitTypeI18n[normalizedType]?.[targetLocale] || null;
}

/**
 * Get the standardized floor type in the target locale
 */
export function getStandardizedFloorType(
  floorType: string,
  targetLocale: Locale = 'en'
): string | null {
  const normalizedType = floorType.toLowerCase();
  return floorTypeI18n[normalizedType]?.[targetLocale] || null;
}

/**
 * Get the standardized unit portion in the target locale
 */
export function getStandardizedUnitPortion(
  unitPortion: string,
  targetLocale: Locale = 'en'
): string | null {
  const normalizedPortion = unitPortion.toLowerCase();
  return unitPortionI18n[normalizedPortion]?.[targetLocale] || null;
}

// ************
// NORMALISATION :: FLOOR
// ************

/**
 * Check if a component is a floor-related component
 */
function isFloorComponent(component: string): boolean {
  const floorPatterns = [
    /\bfloor\b/i,
    /\bfl\b/i,
    /\bground\b/i,
    /\bbasement\b/i,
    /\blower\s+ground\b/i,
    /\bupper\s+ground\b/i,
    /\d+\/f\b/i,
    /\bg\/f\b/i,
    /\bb\/f\b/i,
    /\blg\/f\b/i,
    /\bug\/f\b/i
  ];

  return floorPatterns.some((pattern) => pattern.test(component));
}

// ************
// NORMALISATION :: SUB-PREMISES
// ************

export const subPremesisTerms = [
  '#',
  'apartment',
  'apt',
  'apts',
  'arc',
  'arcade',
  'attic',
  'basement',
  'bk',
  'bld',
  'bldg',
  'blk',
  'block',
  'bsmt',
  'building',
  'building',
  'center',
  'centre',
  'cl',
  'cluster',
  'cmns',
  'commons',
  'complex',
  'cot',
  'cottage',
  'court',
  'courtyard',
  'cplx',
  'ct',
  'ctr',
  'deck',
  'dg',
  'dk',
  'est',
  'estate',
  'fl',
  'flat',
  'floor',
  '/f',
  'g',
  'gardens',
  'gdns',
  'grd',
  'ground',
  'heights',
  'house',
  'hs',
  'hts',
  'ldg',
  'level',
  'lg',
  'lodge',
  'loft',
  'low',
  'lower',
  'lvl',
  'm',
  'mall',
  'manor',
  'mansion',
  'ml',
  'mnr',
  'mns',
  'no',
  'num',
  'number',
  'pd',
  'ph',
  'ph',
  'phase',
  'plaza',
  'plz',
  'podium',
  'quad',
  'residences',
  'resv',
  'sect',
  'sector',
  'stage',
  'ste',
  'stg',
  'storey',
  'story',
  'studio',
  'suite',
  'ter',
  'ter',
  'terrace',
  'terrace',
  'tower',
  'tw',
  'twr',
  'ug',
  'unit',
  'up',
  'upper',
  'ut',
  'utd',
  'villa',
  'vl',
  'wg',
  'wing',
  'zn',
  'zone'
];
