import proj from 'proj4';
import type { LanguageTag } from '$lib/types';

// Coordinate system definitions
proj.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
proj.defs(
  'EPSG:2326',
  '+proj=tmerc +lat_0=22.31213333333334 +lon_0=114.1785555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +datum=HK80 +units=m +no_defs'
);

// Region mappings
const regionNormalised: Record<string, Record<LanguageTag, string>> = {
  'Hong Kong Island': { en: 'HK', 'zh-hant': '香港島', 'zh-hans': '香港岛' },
  Kowloon: { en: 'KL', 'zh-hant': '九龍', 'zh-hans': '九龙' },
  'New Territories': { en: 'NT', 'zh-hant': '新界', 'zh-hans': '新界' }
};

const regionIdentifiers = {
  HK: [
    'hk',
    'hki',
    'hongkongisland',
    'hongkong',
    '港島',
    '香港岛'
  ],
  KL: ['kl', 'kln', 'kwln', 'kowloon', '九龍', '九龙'],
  NT: ['nt', 'ntr', 'newterritories', '新界']
};

let getNormalisedRegionKey = (region: string): keyof typeof regionNormalised => {
  if (!Object.keys(regionNormalised).includes(region)) {
    let region = region.toLowerCase().replace(/ /g, '');
    if (regionIdentifiers.HK.includes(region)) {
      return 'Hong Kong Island';
    } else if (regionIdentifiers.KL.includes(region)) {
      return 'Kowloon';
    } else if (regionIdentifiers.NT.includes(region)) {
      return 'New Territories';
    }
  }
  return region as keyof typeof regionNormalised;
};

export let getNormalisedRegion = (
  region: keyof typeof regionNormalised,
  lang: LanguageTag = 'en'
): string | null => {
  return regionNormalised[getNormalisedRegionKey(region)]?.[lang] || null;
};

// District mappings
const districtNormalised: Record<string, Record<LanguageTag, string>> = {
  'Central & Western': { en: 'CW', 'zh-hant': '中西區', 'zh-hans': '中西区' },
  Eastern: { en: 'EST', 'zh-hant': '東區', 'zh-hans': '东区' },
  Islands: { en: 'ILD', 'zh-hant': '離島區', 'zh-hans': '离岛区' },
  'Kowloon City': { en: 'KLC', 'zh-hant': '九龍城區', 'zh-hans': '九龙城区' },
  'Kwai Tsing': { en: 'KC', 'zh-hant': '葵青區', 'zh-hans': '葵青区' },
  'Kwun Tong': { en: 'KT', 'zh-hant': '觀塘區', 'zh-hans': '观塘区' },
  North: { en: 'NTH', 'zh-hant': '北區', 'zh-hans': '北区' },
  'Sai Kung': { en: 'SK', 'zh-hant': '西貢區', 'zh-hans': '西贡区' },
  'Sha Tin': { en: 'ST', 'zh-hant': '沙田區', 'zh-hans': '沙田区' },
  'Sham Shui Po': { en: 'SSP', 'zh-hant': '深水埗區', 'zh-hans': '深水埗区' },
  Southern: { en: 'STH', 'zh-hant': '南區', 'zh-hans': '南区' },
  'Tai Po': { en: 'TP', 'zh-hant': '大埔區', 'zh-hans': '大埔区' },
  'Tsuen Wan': { en: 'TW', 'zh-hant': '荃灣區', 'zh-hans': '荃湾区' },
  'Tuen Mun': { en: 'TM', 'zh-hant': '屯門區', 'zh-hans': '屯门区' },
  'Wan Chai': { en: 'WC', 'zh-hant': '灣仔區', 'zh-hans': '湾仔区' },
  'Wong Tai Sin': { en: 'WTS', 'zh-hant': '黃大仙區', 'zh-hans': '黄大仙区' },
  'Yau Tsim Mong': { en: 'YTM', 'zh-hant': '油尖旺區', 'zh-hans': '油尖旺区' },
  'Yuen Long': { en: 'YL', 'zh-hant': '元朗區', 'zh-hans': '元朗区' }
};

const districtIdentifiers = {
  CW: [
    'cw',
    'centralandwestern',
    'central&western',
    'centralandwestnerndistrict',
    'central&westnerndistrict',
    '中西區',
    '中西区'
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
    '南区'
  ],
  TP: ['tp', 'taipo', 'taipodistrict', '大埔區', '大浦区'],
  TW: ['tw', 'tsuenwan', 'tsuenwandistrict', '荃灣區', '荃湾区'],
  TM: ['tm', 'tuenmun', 'tuenmundistrict', '屯門區', '屯门区'],
  WC: ['wc', 'wanchai', 'wanchaidistrict', '灣仔區', '湾仔区'],
  WTS: ['wts', 'wongtaisin', 'wongtaitsindistrict', '黃大仙區', '黄大仙区'],
  YTM: ['ytm', 'yautsimmong', 'yautsimmongdistrict', '油尖旺區', '油尖旺区'],
  YL: ['yl', 'yuenlong', 'yuenlongdistrict', '元朗區', '元朗区']
};
const districtCodeToName = {
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
  YL: 'Yuen Long'
};

let getNormalisedDistrictKey = (district: string): keyof typeof districtNormalised => {
  if (!Object.keys(districtNormalised).includes(district)) {
    district = district.toLowerCase().replace(/ /g, '');
    Object.entries(districtIdentifiers).forEach(([key, value]) => {
      if (value.includes(district)) {
        return districtCodeToName[key];
      }
    });
  }
  return district as keyof typeof districtNormalised;
};

export let getNormalisedDistrict = (
  district: keyof typeof districtNormalised,
  lang: LanguageTag = 'en'
): string | null => {
  return districtNormalised[getNormalisedDistrictKey(district)]?.[lang] || null;
};

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
  Suite: 'St'
};

export function convertWGS84ToHK1980(lng: number, lat: number): [number, number] {
  return proj('EPSG:4326', 'EPSG:2326', [lng, lat]);
}

export function convertHK1980ToWGS84(
  easting: number,
  northing: number
): [number, number] {
  return proj('EPSG:2326', 'EPSG:4326', [easting, northing]);
}

export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

export function parseToDisplayAddressEn(address: string, name?: string): string {
  let result = address;

  // Apply abbreviations
  Object.entries(addressAbbreviations).forEach(([full, abbrev]) => {
    const regex = new RegExp(`\\b${full}\\b`, 'gi');
    result = result.replace(regex, abbrev);
  });

  // Move street numbers to start if they're at the end
  const numberAtEnd = result.match(/(\d+)\s*$/);
  if (numberAtEnd) {
    result = result.replace(/\s*\d+$/, '');
    result = `${numberAtEnd[1]} ${result}`;
  }

  // Add name if provided
  if (name) {
    result = `${name}, ${result}`;
  }

  return result;
}

export function parseToDisplayAddressZh(address: string, name?: string): string {
  let result = address;
  // Add name if provided
  if (name) {
    result = `${result}${name}`;
  }

  return result;
}

export function capitalizeFirstLetter(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function getFirstLocation(locations: string): string {
  if (!locations) return '';
  return locations.split(',')[0].trim();
}
