import proj from 'proj4';
// UTILS
import {
  streetNameSuffixes,
  commonStreetNameSuffixes,
  subPremesisTerms,
  getNormalisedRegion,
  getNormalisedDistrict,
  countryIdentifiers,
  regionIdentifiers,
  districtIdentifiers,
  canonicalSubNeighbourhoods,
  canonicalSubNeighbourhoodsZh,
  commonNeighbourhoodAbbreviations,
  reverseApplyAddressAbbreviations,
  nonUniqueStreetNames,
  directionalTokens,
  estateNamesEn
} from '$lib/utils/normalisation';
import { districtionToRegion, regionToCountry } from '$lib/utils/normalisation';
import { parseSubPremisesComponent } from '$lib/utils/geo/parsing';
// API
import { parseStreetAddress } from '$lib/api/external/geocoding';
// DATA
import streetsData from '$lib/map/streets.json';
import neighbourhoodsJson from '$lib/map/neighbourhoods.json';
// TYPES
import type { Locale } from '$lib/types';

// ************
// COORINDATE SYSTEM :: DEFINITIONS
// ************

proj.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
proj.defs(
  'EPSG:2326',
  '+proj=tmerc +lat_0=22.31213333333334 +lon_0=114.1785555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +datum=HK80 +units=m +no_defs'
);

export function convertWGS84ToHK1980(lng: number, lat: number): [number, number] {
  return proj('EPSG:4326', 'EPSG:2326', [lng, lat]);
}

export function convertHK1980ToWGS84(
  easting: number,
  northing: number
): [number, number] {
  return proj('EPSG:2326', 'EPSG:4326', [easting, northing]);
}

/**
 * Convert WGS84 coordinates to Web Mercator (EPSG:3857)
 * @param lng - The longitude of the point to convert
 * @param lat - The latitude of the point to convert
 * @returns The Web Mercator coordinates
 */
export function convertToWebMercator(lng: number, lat: number): [number, number] {
  const x = (lng * 20037508.34) / 180;
  const y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  return [x, (y * 20037508.34) / 180];
}

/**
 * Convert Web Mercator (EPSG:3857) coordinates to WGS84
 * @param x - The x coordinate of the point to convert
 * @param y - The y coordinate of the point to convert
 * @returns The WGS84 coordinates
 */
export function convertFromWebMercator(x: number, y: number): [number, number] {
  const lng = (x * 180) / 20037508.34;
  const lat = (Math.atan(Math.exp((y * Math.PI) / 20037508.34)) * 360) / Math.PI - 90;
  return [lng, lat];
}

// ************
// DISTANCE CALCULATION
// ************

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

  return parseInt((R * c).toFixed(0)); // Distance in meters
}

// ************
// FORMATTING
// ************

export function capitalizeFirstLetter(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function titleCase(str: string | null | undefined): string {
  if (!str) return '';
  return str.split(' ').map(capitalizeFirstLetter).join(' ');
}

export function getFirstLocation(locations: string): string {
  if (!locations) return '';
  return locations.split(',')[0].trim();
}

// ************
// REMOVE ADDRESS COMPONENT
// ************

export function removeCountry(
  str: string,
  isAddressLargeToSmall: boolean = false
): string {
  const parts = str.split(',');
  const largestPart = (isAddressLargeToSmall ? parts.shift() : parts.pop())
    ?.trim()
    .toLowerCase()
    .replace(/\s+/g, '');

  if (largestPart && countryIdentifiers.HKSAR.includes(largestPart)) {
    return parts.join(',').trim();
  }
  return str;
}

export function removeRegion(
  str: string,
  isAddressLargeToSmall: boolean = false
): string {
  const parts = str.split(',');
  const largestPart = (isAddressLargeToSmall ? parts.shift() : parts.pop())
    ?.trim()
    .toLowerCase()
    .replace(/\s+/g, '');

  if (largestPart) {
    // Check against region identifiers (removing spaces for comparison)
    if (
      regionIdentifiers.HK.includes(largestPart) ||
      regionIdentifiers.KL.includes(largestPart) ||
      regionIdentifiers.NT.includes(largestPart)
    ) {
      return parts.join(',').trim();
    }
  }
  return str;
}

export function removeDistrict(
  str: string,
  isAddressLargeToSmall: boolean = false
): string {
  console.log(
    `🔍 removeDistrict: Input "${str}", isAddressLargeToSmall: ${isAddressLargeToSmall}`
  );

  const parts = str.split(',');
  console.log(`🔍 removeDistrict: Parts: [${parts.map((p) => `"${p}"`).join(', ')}]`);

  const lastPart = (isAddressLargeToSmall ? parts.shift() : parts.pop())
    ?.trim()
    .toLowerCase()
    .replace(/\s+/g, '');

  console.log(`🔍 removeDistrict: Extracted part: "${lastPart}"`);
  console.log(
    `🔍 removeDistrict: Remaining parts after pop/shift: [${parts.map((p) => `"${p}"`).join(', ')}]`
  );

  if (
    lastPart &&
    // Check if the last part is a district identifier
    Object.values(districtIdentifiers).some((identifiers) =>
      identifiers.includes(lastPart)
    )
  ) {
    // Find which district identifier matched
    const matchedDistrict = Object.entries(districtIdentifiers).find(
      ([district, identifiers]) => identifiers.includes(lastPart)
    );
    console.log(
      `🔍 removeDistrict: District "${matchedDistrict?.[0]}" found with identifier "${lastPart}", returning: "${parts.join(',').trim()}"`
    );

    const result = parts.join(',').trim();
    return result;
  }

  console.log(`🔍 removeDistrict: No district found, returning original: "${str}"`);
  return str;
}

/************
 * DIRECTION DETECTION
 ************/

/**
 * Detect if an English address is written in small-to-large or large-to-small order
 * @param address - The address string to analyze
 * @param testFirstSegment - If true, prioritize testing the first segment instead of the last segment
 * @returns true if small-to-large, false if large-to-small, null if indeterminate
 */
function isEnglishAddressSmallToLarge(
  address: string,
  testFirstSegment: boolean = false
): boolean | null {
  const segments = address
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, ''));

  // Check last segment first - if it's a high-level administrative unit, likely small-to-large
  if (segments.length > 0) {
    const lastSeg = segments[segments.length - 1];

    // Check for country/region/district at end (large-to-small)
    if (countryIdentifiers.HKSAR.includes(lastSeg)) {
      return true;
    }

    // Use existing normalization functions to check regions/districts
    try {
      if (getNormalisedRegion(lastSeg) !== null) {
        return true;
      }
      if (getNormalisedDistrict(lastSeg) !== null) {
        return true;
      }
    } catch (e) {
      // Ignore errors from normalization functions
    }

    // Check for neighbourhood at end (large-to-small)
    const neighbourhoodMatch = canonicalSubNeighbourhoods.find((neighbourhood) =>
      lastSeg.includes(neighbourhood.toLowerCase().replace(/\s+/g, ''))
    );
    if (neighbourhoodMatch) {
      return true;
    }
  }

  // Then check first segment - if it's a high-level administrative unit, likely large-to-small
  if (segments.length > 0) {
    const firstSeg = segments[0];

    // Check for country/region/district at start (large-to-small)
    if (countryIdentifiers.HKSAR.includes(firstSeg)) {
      return false;
    }

    // Use existing normalization functions to check regions/districts
    try {
      if (getNormalisedRegion(firstSeg) !== null) {
        return false;
      }
      if (getNormalisedDistrict(firstSeg) !== null) {
        return false;
      }
    } catch (e) {
      // Ignore errors from normalization functions
    }

    // Check for neighbourhood at start (large-to-small)
    const neighbourhoodMatch = canonicalSubNeighbourhoods.find((neighbourhood) =>
      firstSeg.includes(neighbourhood.toLowerCase().replace(/\s+/g, ''))
    );
    if (neighbourhoodMatch) {
      return false;
    }
  }

  // Check for street patterns to infer direction

  let streetIdx = -1;
  let subPremisesIdx = -1;

  // Find street and sub-premises positions
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Check for street suffixes
    if (streetIdx === -1) {
      for (const suffix of streetNameSuffixes) {
        if (seg.endsWith(suffix.toLowerCase())) {
          streetIdx = i;
          break;
        }
      }
    }

    // Check for sub-premises terms
    if (subPremisesIdx === -1) {
      const segNoNum = seg.replace(/\d+/g, '');
      for (const term of subPremesisTerms) {
        if (segNoNum.includes(term.toLowerCase())) {
          subPremisesIdx = i;
          break;
        }
      }
    }
  }

  // If we have both street and sub-premises, use their relative position
  if (streetIdx !== -1 && subPremisesIdx !== -1) {
    const isSmallToLarge = subPremisesIdx < streetIdx;
    return isSmallToLarge;
  }

  // Default assumption for English addresses: small-to-large
  return true;
}

/**
 * Extract a country from an address using country identifiers.
 * Only matches when country names are explicitly mentioned in the address.
 *
 * @param address - The address to extract the country from
 * @param locale - The locale for extraction (currently only 'en' supported)
 * @returns The country key, or null if the country is not explicitly mentioned
 */
export function extractCountryFromAddress(
  address: string,
  locale: Locale = 'en'
): string | null {
  if (!address || address.trim() === '') {
    return null;
  }

  // Split address into segments
  const segments = address.split(',').map((s) => s.trim().toLowerCase());

  // Special case: Check if last segment is "Hong Kong" or "HK"
  if (segments.length >= 1) {
    const lastSegment = segments[segments.length - 1];

    // Check if last segment is Hong Kong or HK
    const isHongKongLast = lastSegment === 'hong kong' || lastSegment === 'hk';

    if (isHongKongLast) {
      // If we have at least 2 segments, check if second-to-last is a region
      if (segments.length >= 2) {
        const secondToLastSegment = segments[segments.length - 2];
        const cleanSecondToLast = secondToLastSegment.replace(/\s+/g, '');

        for (const [regionKey, regionIds] of Object.entries(regionIdentifiers)) {
          for (const regionIdentifier of regionIds) {
            const cleanRegionIdentifier = regionIdentifier
              .toLowerCase()
              .replace(/\s+/g, '');

            if (cleanSecondToLast === cleanRegionIdentifier) {
              return 'HKSAR';
            }
          }
        }
      }
    }
  }

  // Search for country in segments - only match explicit country mentions
  for (const segment of segments) {
    // Clean segment for matching
    const cleanSegment = segment.replace(/\s+/g, '');

    // Check against country identifiers
    for (const [countryKey, identifiers] of Object.entries(countryIdentifiers)) {
      for (const identifier of identifiers) {
        const cleanIdentifier = identifier.toLowerCase().replace(/\s+/g, '');

        // Only match explicit country mentions:
        // 1. Exact segment match (e.g., "Hong Kong" as a standalone segment)
        // 2. Word boundary match for longer identifiers (>=4 chars)
        const isExactMatch = cleanSegment === cleanIdentifier;
        const isWordBoundaryMatch =
          cleanIdentifier.length >= 4 &&
          new RegExp(`\\b${cleanIdentifier}\\b`).test(cleanSegment);

        // Additional safeguards:
        // - Don't match very short identifiers (<=3 chars) in longer segments
        const avoidShortMatches =
          cleanIdentifier.length <= 3 &&
          cleanSegment.length > cleanIdentifier.length + 2;

        if ((isExactMatch || isWordBoundaryMatch) && !avoidShortMatches) {
          return countryKey;
        }
      }
    }
  }

  return null;
}

/**
 * Extract a region from an address using region identifiers.
 * Only matches when region names are explicitly mentioned in the address.
 *
 * @param address - The address to extract the region from
 * @param locale - The locale for extraction (currently only 'en' supported)
 * @returns The region key, or null if the region is not explicitly mentioned
 */
export function extractRegionFromAddress(
  address: string,
  locale: Locale = 'en'
): string | null {
  if (!address || address.trim() === '') {
    return null;
  }

  // Split address into segments
  const segments = address.split(',').map((s) => s.trim().toLowerCase());

  // Search for region in segments - only match explicit region mentions
  for (const segment of segments) {
    // Clean segment for matching
    const cleanSegment = segment.replace(/\s+/g, '');

    // Check against region identifiers
    for (const [regionKey, identifiers] of Object.entries(regionIdentifiers)) {
      for (const identifier of identifiers) {
        const cleanIdentifier = identifier.toLowerCase().replace(/\s+/g, '');

        // Only match explicit region mentions:
        // 1. Exact segment match (e.g., "Hong Kong Island" as a standalone segment)
        // 2. Word boundary match for longer identifiers (>=4 chars)
        const isExactMatch = cleanSegment === cleanIdentifier;
        const isWordBoundaryMatch =
          cleanIdentifier.length >= 4 &&
          new RegExp(`\\b${cleanIdentifier}\\b`).test(cleanSegment);

        // Additional safeguards:
        // - Don't match very short identifiers (<=3 chars) in longer segments
        const avoidShortMatches =
          cleanIdentifier.length <= 3 &&
          cleanSegment.length > cleanIdentifier.length + 2;

        if ((isExactMatch || isWordBoundaryMatch) && !avoidShortMatches) {
          return regionKey;
        }
      }
    }
  }

  return null;
}

/**
 * Extract a district from an address, using direction detection and existing normalization utilities.
 * Only matches when district names are explicitly mentioned in the address.
 *
 * @note Only returns district when explicitly mentioned - neighbourhood-based inference should be done separately
 *
 * @param address - The address to extract the district from
 * @returns The district key, or null if the district is not explicitly mentioned
 */
export function extractDistrictFromAddress(
  address: string,
  locale: Locale = 'en'
): string | null {
  if (!address || address.trim() === '') {
    return null;
  }

  // Split address into segments
  const segments = address.split(',').map((s) => s.trim().toLowerCase());

  // Search for district in segments - only match explicit district mentions
  for (const segment of segments) {
    // Clean segment for matching
    const cleanSegment = segment.replace(/\s+/g, '');

    // Check against district identifiers - prioritize full district names over abbreviations
    for (const [districtKey, identifiers] of Object.entries(districtIdentifiers)) {
      for (const identifier of identifiers) {
        const cleanIdentifier = identifier.toLowerCase().replace(/\s+/g, '');

        // Only match explicit district mentions:
        // 1. Exact segment match (e.g., "Central" as a standalone segment)
        // 2. Word boundary match for longer identifiers (>=4 chars)
        // 3. Avoid matching abbreviations in street names or building names
        const isExactMatch = cleanSegment === cleanIdentifier;
        const isWordBoundaryMatch =
          cleanIdentifier.length >= 4 &&
          new RegExp(`\\b${cleanIdentifier}\\b`).test(cleanSegment);

        // Additional safeguards:
        // - Don't match very short identifiers (<=3 chars) in longer segments
        // - Don't match if the segment contains other words that suggest it's not a district mention
        const avoidShortMatches =
          cleanIdentifier.length <= 3 &&
          cleanSegment.length > cleanIdentifier.length + 2;
        const containsBuildingIndicators =
          /\b(building|tower|centre|center|plaza|mall|market|estate|court|house|mansion|road|street|avenue)\b/.test(
            segment
          );

        if (
          (isExactMatch || isWordBoundaryMatch) &&
          !avoidShortMatches &&
          !containsBuildingIndicators
        ) {
          return districtKey;
        }
      }
    }
  }

  return null;
}

/**
 * Extract an neighbourhood from an address, using direction detection and existing normalization utilities.
 * @param address - The address to extract the neighbourhood from
 * @returns The neighbourhood, or null if the neighbourhood is not found
 */
export function extractNeighbourhoodFromAddress(
  address: string,
  locale: Locale = 'en',
  isSmallToLarge: boolean = true
): string | null {
  if (!address || address.trim() === '') {
    return null;
  }

  // Split address into segments
  const segments = address.split(',').map((s) => s.trim().toLowerCase());

  // Search for neighbourhood in appropriate order
  const searchOrder = isSmallToLarge ? [...segments].reverse() : segments;
  const neighbourhoods =
    locale === 'en' ? canonicalSubNeighbourhoods : canonicalSubNeighbourhoodsZh;

  let lastIdentifiedNeighbourhood: string | null = null;

  for (const segment of searchOrder) {
    // Check if this segment contains street name suffixes
    // 1. Ends with street suffix (e.g., "Bowrington Road")
    // 2. Contains street suffix followed by directional words (e.g., "Prince Edward Road East")
    const hasStreetSuffix = commonStreetNameSuffixes.some((suffix) => {
      const suffixPattern = ' ' + suffix.toLowerCase();
      const segmentLower = segment.toLowerCase();

      // Check if ends with street suffix
      if (segmentLower.endsWith(suffixPattern)) {
        return true;
      }

      // Check if contains street suffix followed by directional words
      const suffixIndex = segmentLower.indexOf(suffixPattern);
      if (suffixIndex !== -1) {
        const afterSuffix = segmentLower
          .substring(suffixIndex + suffixPattern.length)
          .trim();
        // Only consider it a street if the directional word appears immediately after the street suffix
        // (separated by space, not as part of a neighbourhood name like "Tsuen Wan West")
        return directionalTokens.some(
          (dir) => afterSuffix === dir || afterSuffix.startsWith(dir + ' ')
        );
      }

      return false;
    });

    // If we hit a street segment, return the last identified neighbourhood
    if (hasStreetSuffix) {
      return lastIdentifiedNeighbourhood;
    }

    // Clean segment for matching
    const cleanSegment = segment.replace(/\s+/g, '');

    // First check for abbreviations (only for English locale)
    if (locale === 'en') {
      for (const [abbrev, canonicalName] of Object.entries(
        commonNeighbourhoodAbbreviations
      )) {
        if (cleanSegment === abbrev.toLowerCase().replace(/\s+/g, '')) {
          lastIdentifiedNeighbourhood = canonicalName;
          break; // Found abbreviation match, continue to next segment
        }
      }
    }

    // Also check for regular neighbourhood matches (continue even if abbreviation was found)
    // First try exact match, then partial match
    const exactMatch = neighbourhoods.find(
      (neighbourhood) =>
        cleanSegment === neighbourhood.toLowerCase().replace(/\s+/g, '')
    );

    const partialMatch = neighbourhoods.find((neighbourhood) =>
      cleanSegment.includes(neighbourhood.toLowerCase().replace(/\s+/g, ''))
    );

    if (exactMatch) {
      lastIdentifiedNeighbourhood = exactMatch;
    } else if (partialMatch) {
      lastIdentifiedNeighbourhood = partialMatch;
    }
  }

  // Return the last identified neighbourhood (or null if none found)
  return lastIdentifiedNeighbourhood;
}

// function _isNeighbourhoodPartOfStreetName(
//   extractedNeighbourhood: string,
//   locale: Locale
// ): boolean {
//   let isPartOfStreetAddress = false;

//   if (locale === 'en') {
//     // English pattern: [number] [neighbourhood] [anything] [street suffix]
//     const streetAddressPattern = new RegExp(
//       `\\b\\d+[\\w\\s]*\\b${extractedNeighbourhood.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\w\\s]*\\b(street|road|avenue|lane|drive|way|place|court|crescent|terrace|gardens|park|square|close|grove|mews|walk|row|hill|rise|view|heights|bridge|circus|wharf|promenade)\\b`,
//       'i'
//     );
//     isPartOfStreetAddress = streetAddressPattern.test(cleaned);
//   } else if (locale === 'zh-hant' || locale === 'zh-hans') {
//     // Chinese pattern: [number] [neighbourhood] [anything] [street suffix]
//     // Chinese addresses can have various formats, including:
//     // - 123號 + [neighbourhood] + 街/道/路 (e.g., "123號德輔道中")
//     // - [neighbourhood] + 123號 (e.g., "德輔道中123號")
//     // - [number] + [neighbourhood] + [street suffix] (e.g., "18 Aberdeen Reservoir Road" in Chinese context)

//     const escapedNeighbourhood = extractedNeighbourhood.replace(
//       /[.*+?^${}()|[\]\\]/g,
//       '\\$&'
//     );

//     // Pattern 1: [number/號] [neighbourhood] [street suffix]
//     const chinesePattern1 = new RegExp(
//       `(\\d+號?)[\\w\\s]*${escapedNeighbourhood}[\\w\\s]*(街|道|路|巷|里|弄|段|大道|公路|徑|坊|圍|村|邨|苑|園|廣場|中心|商場|大樓|街市|市場)`,
//       'i'
//     );

//     // Pattern 2: [neighbourhood] [number/號] (neighbourhood as part of street name)
//     const chinesePattern2 = new RegExp(
//       `${escapedNeighbourhood}[\\w\\s]*(街|道|路|巷|里|弄|段|大道|公路|徑|坊|圍|村|邨|苑|園|廣場|中心|商場|大樓|街市|市場)[\\w\\s]*\\d+號?`,
//       'i'
//     );

//     isPartOfStreetAddress =
//       chinesePattern1.test(cleaned) || chinesePattern2.test(cleaned);
//   }

//   if (isPartOfStreetAddress) {
//     // The neighbourhood appears in a street address pattern, don't extract it
//     console.log(
//       `🗺️ GeoLookupStep: "${extractedNeighbourhood}" appears in street address pattern (${locale}), not extracting as neighbourhood`
//     );
//     neighbourhood = null;
//   } else {
//     neighbourhood = extractedNeighbourhood;
//     console.log(`🗺️ GeoLookupStep: Extracted neighbourhood: "${neighbourhood}"`);
//   }
//   return neighbourhood;
// }

/**
 * Detect if a Chinese address is written in small-to-large or large-to-small order
 * @param address - The Chinese address string to analyze
 * @returns false if small-to-large, true if large-to-small, null if indeterminate
 */
function isChineseAddressLargeToSmall(address: string): boolean | null {
  // Chinese addresses typically don't have comma separation and are usually large-to-small
  const cleanAddress = address.replace(/\s+/g, '');

  // Import existing identifiers from normalisation.ts

  // Check first few characters for high-level administrative units
  const prefixes = [2, 3, 4, 5].map((len) => cleanAddress.substring(0, len));

  for (const prefix of prefixes) {
    // Check for Hong Kong identifiers
    if (countryIdentifiers.HKSAR.some((id) => prefix.includes(id))) {
      return true;
    }

    // Check for region/district using existing normalization
    try {
      if (
        getNormalisedRegion(prefix) !== null ||
        getNormalisedDistrict(prefix) !== null
      ) {
        return true;
      }
    } catch (e) {
      // Ignore errors from normalization functions
    }
  }

  // Check the end of the address for high-level administrative units
  const suffixes = [2, 3, 4, 5].map((len) =>
    cleanAddress.substring(cleanAddress.length - len)
  );

  for (const suffix of suffixes) {
    if (countryIdentifiers.HKSAR.some((id) => suffix.includes(id))) {
      return false;
    }

    try {
      if (
        getNormalisedRegion(suffix) !== null ||
        getNormalisedDistrict(suffix) !== null
      ) {
        return false;
      }
    } catch (e) {
      // Ignore errors
    }
  }

  // Default assumption for Chinese addresses: large-to-small
  return true;
}

/**
 * PART EXTRACTION
 */

/**
 * Clean and parse an address string into street address and neighbourhood components
 *
 * @note : If a district is returned, that's because the street address is not unique.
 *
 * Process:
 * 1. Remove country, region, and district identifiers
 * 2. Extract neighbourhood using pattern matching
 * 3. Use streets.json data to identify and extract street components
 * 4. Remove neighbourhood from address to get clean street address
 *
 * @param address - The raw address string to clean and parse
 * @returns Object with cleaned streetAddress and extracted neighbourhood
 */
// TYPES
type StructuredAddressComponents = {
  queryAddress: string;
  streetAddress: string;
  streetName: string | null;
  estateName: string | null; //
  premisesName: string | null; // Market
  buildingNumbering: string | null;
  buildingNumberFrom: string | null;
  buildingNumberTo: string | null;
  subpremisesRaw: string | null;
  neighbourhood: string | null;
  neighbourhoodRef: string | null;
  district: string | null;
};

type SubpremiseComponents = {
  unitPortion: string | null;
  unitNumber: string | null;
  unitType: string | null;
  floorNumber: string | null;
  floorType: string | null;
};

/**
 * Parse subpremise components from raw subpremise string
 * Extracts unit and floor information from address components
 */
function parseSubpremiseComponents(
  subpremisesRaw: string | null,
  locale: Locale = 'en'
): SubpremiseComponents {
  if (!subpremisesRaw) {
    return {
      unitPortion: null,
      unitNumber: null,
      unitType: null,
      floorNumber: null,
      floorType: null
    };
  }

  let unitPortion: string | null = null;
  let unitNumber: string | null = null;
  let unitType: string | null = null;
  let floorNumber: string | null = null;
  let floorType: string | null = null;

  if (locale === 'en') {
    // English patterns
    const unitMatch = subpremisesRaw.match(/\b(flat|unit|room|suite)\s*(\d+[a-z]?)/i);
    if (unitMatch) {
      unitType = unitMatch[1].toLowerCase();
      unitNumber = unitMatch[2];
      unitPortion = unitMatch[0];
    }

    const floorMatch =
      subpremisesRaw.match(/\b(\d+)(?:st|nd|rd|th)?\s*(floor|f|level)\b/i) ||
      subpremisesRaw.match(/\b(floor|level)\s*(\d+)/i);
    if (floorMatch) {
      floorNumber = floorMatch[1];
      floorType = floorMatch[2] ? floorMatch[2].toLowerCase() : 'floor';
    }

    // Shop pattern
    const shopMatch = subpremisesRaw.match(/\b(shop)\s*(\d+[a-z]?)/i);
    if (shopMatch) {
      unitType = shopMatch[1].toLowerCase();
      unitNumber = shopMatch[2];
      unitPortion = shopMatch[0];
    }
  } else {
    // Chinese patterns
    const unitMatch =
      subpremisesRaw.match(/(\d+[a-z]?)\s*(室|座|單位|房)/i) ||
      subpremisesRaw.match(/(室|座|單位|房)\s*(\d+[a-z]?)/i);
    if (unitMatch) {
      unitNumber = unitMatch[1].match(/\d+[a-z]?/) ? unitMatch[1] : unitMatch[2];
      unitType = unitMatch[1].match(/\d+[a-z]?/) ? unitMatch[2] : unitMatch[1];
      unitPortion = unitMatch[0];
    }

    const floorMatch =
      subpremisesRaw.match(/(\d+)\s*(樓|層|f)/i) ||
      subpremisesRaw.match(/(樓|層|f)\s*(\d+)/i);
    if (floorMatch) {
      floorNumber = floorMatch[1].match(/\d+/) ? floorMatch[1] : floorMatch[2];
      floorType = floorMatch[1].match(/\d+/) ? floorMatch[2] : floorMatch[1];
    }

    // Shop pattern
    const shopMatch =
      subpremisesRaw.match(/(\d+[a-z]?)\s*(舖|店)/i) ||
      subpremisesRaw.match(/(舖|店)\s*(\d+[a-z]?)/i);
    if (shopMatch) {
      unitNumber = shopMatch[1].match(/\d+[a-z]?/) ? shopMatch[1] : shopMatch[2];
      unitType = shopMatch[1].match(/\d+[a-z]?/) ? shopMatch[2] : shopMatch[1];
      unitPortion = shopMatch[0];
    }
  }

  return {
    unitPortion,
    unitNumber,
    unitType,
    floorNumber,
    floorType
  };
}

/**
 * Get neighbourhood reference key from neighbourhood name
 * Handles disambiguation for neighbourhoods with same names
 */
function getNeighbourhoodRef(
  neighbourhood: string | null,
  district: string | null,
  locale: Locale = 'en'
): string | null {
  if (!neighbourhood) return null;

  // 1. Loop through all neighbourhoods, collect those whose i18n[locale].neighbourhood matches the input
  const matchingKeys: string[] = [];
  const neighbourhoodRefs = Object.keys(neighbourhoodsJson);

  for (const key of neighbourhoodRefs) {
    const data = neighbourhoodsJson[key as keyof typeof neighbourhoodsJson];
    if (
      data.i18n &&
      data.i18n[locale] &&
      data.i18n[locale].name &&
      data.i18n[locale].name.toLowerCase() === neighbourhood.toLowerCase()
    ) {
      // 2. If the key does not contain a comma, it's unique, return immediately
      if (!key.includes(',')) {
        return key;
      }
      // 3. Otherwise, collect for later disambiguation
      matchingKeys.push(key);
    }
  }

  // 4. If there are multiple with the same name (all with commas in key), disambiguate by district
  if (matchingKeys.length > 0 && district) {
    // Use getNormalisedDistrict to compare
    const normalisedDistrict = getNormalisedDistrict(district, locale);
    for (const key of matchingKeys) {
      const data = neighbourhoodsJson[key as keyof typeof neighbourhoodsJson];
      if (
        data.i18n &&
        data.i18n[locale] &&
        data.i18n[locale].district &&
        data.i18n[locale].district.toLowerCase() === normalisedDistrict.toLowerCase()
      ) {
        return key;
      }
    }
    // If no district match, return the first matching key as fallback
    return matchingKeys[0];
  }

  // 5. If no match found, return null
  return null;
}

// ************
// ADDRESS PARSING HELPERS
// ************

/**
 * Extract estate information from address components
 */
export function subtractEstateFromAddress(
  address: string,
  locale: Locale = 'en'
): {
  estateName: string | null;
  phaseName: string | null;
  phaseNumber: string | null;
  blockType: string | null;
  blockNumber: string | null;
  blockTypeBeforeNumber: boolean;
  remainingAddress: string;
} {
  const parts = address
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const remainingParts: string[] = [];

  let estateName: string | null = null;
  let phaseName: string | null = null;
  let phaseNumber: string | null = null;
  let blockType: string | null = null;
  let blockNumber: string | null = null;
  let blockTypeBeforeNumber = false;

  for (const part of parts) {
    let matched = false;

    // Check for estate names
    if (locale === 'en') {
      const estatePattern = /\b(Estate|Terrace|Court|Estate West|Estate East)\b/i;
      if (estatePattern.test(part)) {
        const normalizedPart = part.trim();
        if (
          estateNamesEn.some(
            (estate) =>
              estate.toLowerCase().replace(/[()]/g, '') ===
              normalizedPart.toLowerCase().replace(/[()]/g, '')
          )
        ) {
          estateName = normalizedPart;
          matched = true;
        }
      }
    } else {
      // Chinese estate patterns
      const estatePattern = /(邨|苑|園|庭|閣|台|樓|大廈)$/;
      if (estatePattern.test(part)) {
        estateName = part.trim();
        matched = true;
      }
    }

    // Check for phase information
    if (!matched) {
      const phasePattern =
        locale === 'en'
          ? /\b(Phase|Ph\.?)\s*([A-Za-z0-9]{1,2}|[A-Za-z0-9]{3,})\b/i
          : /第?([一二三四五六七八九十0-9A-Za-z]{1,2}|[一二三四五六七八九十0-9A-Za-z]{3,})期/;

      const phaseMatch = part.match(phasePattern);
      if (phaseMatch) {
        const value = phaseMatch[locale === 'en' ? 2 : 1];
        if (value.length <= 2) {
          phaseNumber = value;
        } else {
          phaseName = value;
        }
        matched = true;
      }
    }

    // Check for block information
    if (!matched) {
      const blockPatterns =
        locale === 'en'
          ? [
              /\b(Block|Blk\.?)\s*([A-Za-z0-9]+)\b/i, // Block A, Blk 1
              /\b([A-Za-z0-9]+)\s*(Block|Blk\.?)\b/i, // A Block, 1 Blk
              /\b(Tower|Twr\.?)\s*([A-Za-z0-9]+)\b/i, // Tower A, Twr 1
              /\b([A-Za-z0-9]+)\s*(Tower|Twr\.?)\b/i // A Tower, 1 Twr
            ]
          : [
              /([A-Za-z0-9一二三四五六七八九十]+)座/, // 1座, A座
              /座([A-Za-z0-9一二三四五六七八九十]+)/, // 座1, 座A
              /([A-Za-z0-9一二三四五六七八九十]+)棟/, // 1棟, A棟
              /棟([A-Za-z0-9一二三四五六七八九十]+)/ // 棟1, 棟A
            ];

      for (const pattern of blockPatterns) {
        const blockMatch = part.match(pattern);
        if (blockMatch) {
          if (locale === 'en') {
            if (blockMatch[1] && /^(Block|Blk\.?|Tower|Twr\.?)$/i.test(blockMatch[1])) {
              // Type before number: "Block A"
              blockType = blockMatch[1].replace(/\.$/, '');
              blockNumber = blockMatch[2];
              blockTypeBeforeNumber = true;
            } else {
              // Number before type: "A Block"
              blockNumber = blockMatch[1];
              blockType = blockMatch[2].replace(/\.$/, '');
              blockTypeBeforeNumber = false;
            }
          } else {
            blockNumber = blockMatch[1];
            blockType = part.includes('座') ? '座' : '棟';
            blockTypeBeforeNumber = false;
          }
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      remainingParts.push(part);
    }
  }

  return {
    estateName,
    phaseName,
    phaseNumber,
    blockType,
    blockNumber,
    blockTypeBeforeNumber,
    remainingAddress: remainingParts.join(', ')
  };
}

/**
 * Extract lot information from address components
 */
export function subtractLotFromAddress(address: string): {
  lotType: string | null;
  lotNumber: string | null;
  remainingAddress: string;
} {
  const parts = address
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const remainingParts: string[] = [];

  let lotType: string | null = null;
  let lotNumber: string | null = null;

  for (const part of parts) {
    const lotPattern = /\b(R\.?B\.?L\.?|RBL|Rural Building Lot)\b/i;
    const lotMatch = part.match(lotPattern);

    if (lotMatch) {
      lotType = 'RBL';
      lotNumber = part.replace(lotPattern, '').trim();
    } else {
      remainingParts.push(part);
    }
  }

  return {
    lotType,
    lotNumber,
    remainingAddress: remainingParts.join(', ')
  };
}

/**
 * Extract premises information from address components
 */
export function subtractPremisesFromAddress(
  address: string,
  locale: Locale = 'en'
): {
  premisesName: string | null;
  remainingAddress: string;
} {
  const parts = address
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const remainingParts: string[] = [];

  let premisesName: string | null = null;

  for (const part of parts) {
    const marketPattern = locale === 'en' ? /\bMarket$/i : /市場$/;

    if (marketPattern.test(part)) {
      premisesName = part.trim();
    } else {
      remainingParts.push(part);
    }
  }

  return {
    premisesName,
    remainingAddress: remainingParts.join(', ')
  };
}

/**
 * Extract building name from address components
 */
export function subtractBuildingFromAddress(
  address: string,
  locale: Locale = 'en'
): {
  buildingName: string | null;
  remainingAddress: string;
} {
  const parts = address
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const remainingParts: string[] = [];

  let buildingName: string | null = null;

  const buildingTerms = locale === 'en' ? [
          'Building',
          'Bldg',
          'Tower',
          'Twr',
          'House',
          'Center',
          'Centre',
          'Heights',
          'Plaza',
          'Court',
          'Mansion',
          'Apartments',
          'Apts'
        ] : [
          '大廈',
          '大樓',
          '樓',
          '塔',
          '屋',
          '中心',
          '廣場',
          '苑',
          '閣',
          '台',
          '邨'
        ];

  for (const part of parts) {
    const buildingPattern = new RegExp(
      `\\b(${buildingTerms.join('|')})$`,
      locale === 'en' ? 'i' : ''
    );

    if (buildingPattern.test(part)) {
      buildingName = part.trim();
    } else {
      remainingParts.push(part);
    }
  }

  return {
    buildingName,
    remainingAddress: remainingParts.join(', ')
  };
}

/**
 * Check if street name requires location context for uniqueness
 */
function checkStreetUniqueness(
  streetName: string | null,
  district: string | null,
  neighbourhood: string | null,
  locale: Locale = 'en'
): string | null {
  if (!streetName) return null;

  const nonUniqueNames = nonUniqueStreetNames[locale] || nonUniqueStreetNames.en;
  const isNonUnique = nonUniqueNames.some((nonUniqueName) =>
    streetName.toLowerCase().includes(nonUniqueName.toLowerCase())
  );

  if (isNonUnique && (district || neighbourhood)) {
    const locationInfo = district || neighbourhood;
    return locationInfo;
  }

  return null;
}

/**
 * Build query address from components using template
 */
export function getQueryAddress(
  estateName: string | null,
  phaseName: string | null,
  phaseNumber: string | null,
  blockType: string | null,
  blockNumber: string | null,
  blockTypeBeforeNumber: boolean,
  premisesName: string | null,
  buildingName: string | null,
  streetAddress: string | null,
  neighbourhood: string | null = null,
  district: string | null = null,
  locale: Locale = 'en'
): string | null {
  const components: string[] = [];

  // Block component: {blockTypeBeforeNumber ? BlockType BlockNumber : BlockNumber BlockType}
  if (blockType && blockNumber) {
    const blockComponent = blockTypeBeforeNumber
      ? `${blockType} ${blockNumber}`
      : `${blockNumber} ${blockType}`;
    components.push(blockComponent);
  }

  // Phase component: {PhaseName} Phase {PhaseNumber}
  if (phaseName || phaseNumber) {
    let phaseComponent = '';
    if (phaseName) {
      phaseComponent += phaseName;
    }
    if (locale === 'en') {
      phaseComponent += ' Phase';
    } else {
      phaseComponent = `第${phaseComponent || phaseNumber}期`;
    }
    if (phaseNumber && locale === 'en') {
      phaseComponent += ` ${phaseNumber}`;
    }
    components.push(phaseComponent.trim());
  }

  // Premises name
  if (premisesName) {
    components.push(premisesName);
  }

  // Building name
  if (buildingName) {
    components.push(buildingName);
  }

  // Estate name
  if (estateName) {
    components.push(estateName);
  }

  // Street address
  if (streetAddress) {
    // Check if we need to add location context for uniqueness
    const streetName = streetAddress.split(/\s+/).slice(-2).join(' '); // Get last 2 words as street name approximation
    const locationContext = checkStreetUniqueness(
      streetName,
      district,
      neighbourhood,
      locale
    );

    if (
      locationContext &&
      !streetAddress.toLowerCase().includes(locationContext.toLowerCase())
    ) {
      components.push(`${streetAddress}, ${locationContext}`);
    } else {
      components.push(streetAddress);
    }
  }

  // At least one of premisesName, buildingName, estateName, or streetAddress is required
  if (!premisesName && !buildingName && !estateName && !streetAddress) {
    return null;
  }

  return components.join(', ');
}

/**
 * Extract subpremises from address after geographic components are removed
 * Looks for segments that contain unit types, floor types, or numeric/alphanumeric identifiers
 */
function extractSubpremisesFromAddress(
  address: string,
  locale: Locale = 'en'
): {
  subpremisesRaw: string | null;
  remainingAddress: string;
} {
  if (!address.trim()) {
    return { subpremisesRaw: null, remainingAddress: address };
  }

  const addressParts = address
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (addressParts.length === 0) {
    return { subpremisesRaw: null, remainingAddress: address };
  }

  // Define subpremise indicators for both languages
  const subpremiseIndicators = {
    en: {
      unitTypes: /\b(flat|unit|room|shop|office|suite|suites|block)\b/i,
      floorTypes:
        /\b(basement|concourse|car\s+park|level|ground|lower\s+ground|lower\s+parking|mezzanine|parking|pantry|parking\s+ramp|roof|terrace|upper|upper\s+ground|floor|fl)\b/i,
      floorAbbreviations:
        /\b(g\/f|b\/f|lg\/f|ug\/f|m\/f|c\/f|r\/f|t\/f|pa\/f|pr\/f|cp\/f|l\/f|\d+\/f|\d+f)\b/i,
      numericAlphaPattern: /\b\d+[a-zA-Z]*(?:[-–&,\s]+\d+[a-zA-Z]*)*\b/,
      singleLetterPattern: /\b[a-zA-Z](?:\s*[&,]\s*[a-zA-Z])*\b/
    },
    'zh-hant': {
      unitTypes: /\b(室|座|舖|單位|房|辦公室)\b/i,
      floorTypes:
        /\b(地庫|大堂|停車場|樓層|地下|低層|低層停車場|夾層|茶水間|天台|平台|高層|樓|層)\b/i,
      floorAbbreviations:
        /\b(g\/f|b\/f|lg\/f|ug\/f|m\/f|c\/f|r\/f|t\/f|pa\/f|pr\/f|cp\/f|l\/f|\d+\/f|\d+f|\d+樓)\b/i,
      numericAlphaPattern: /\b\d+[a-zA-Z]*(?:[-–&,\s]+\d+[a-zA-Z]*)*\b/,
      singleLetterPattern: /\b[a-zA-Z](?:\s*[&,]\s*[a-zA-Z])*\b/
    },
    'zh-hans': {
      unitTypes: /\b(室|座|铺|单位|房|办公室)\b/i,
      floorTypes:
        /\b(地库|大堂|停车场|楼层|地下|低层|低层停车场|夹层|茶水间|天台|平台|高层|楼|层)\b/i,
      floorAbbreviations:
        /\b(g\/f|b\/f|lg\/f|ug\/f|m\/f|c\/f|r\/f|t\/f|pa\/f|pr\/f|cp\/f|l\/f|\d+\/f|\d+f|\d+楼)\b/i,
      numericAlphaPattern: /\b\d+[a-zA-Z]*(?:[-–&,\s]+\d+[a-zA-Z]*)*\b/,
      singleLetterPattern: /\b[a-zA-Z](?:\s*[&,]\s*[a-zA-Z])*\b/
    }
  };

  const indicators = subpremiseIndicators[locale] || subpremiseIndicators.en;
  const subpremiseParts: string[] = [];
  const remainingParts: string[] = [];
  let foundSubpremise = false;

  for (let i = 0; i < addressParts.length; i++) {
    const part = addressParts[i];

    // Check if this part looks like a street address (contains street keywords)
    const streetKeywords =
      /\b(street|road|avenue|lane|drive|place|terrace|square|crescent|close|way|park|hill|garden|court|row|walk|mews|grove|rise|view|heights|estate|centre|center|building|tower|house)\b/i;
    const hasStreetKeyword = streetKeywords.test(part);

    // Check if this part contains building numbers (like "55-57 Catchick Street")
    const hasBuildingNumber =
      /^\d+[a-zA-Z]*[-–]\d+[a-zA-Z]*\s+\w+/.test(part) ||
      /^\d+[a-zA-Z]*\s+\w+/.test(part);

    // Special handling for mall/plaza with level information (e.g., "ifc mall Level 1")
    const hasLevelInMall = /\b(mall|plaza)\s+level\s+\d+/i.test(part);

    const isSubpremise =
      (indicators.unitTypes.test(part) ||
        indicators.floorTypes.test(part) ||
        indicators.floorAbbreviations.test(part) ||
        hasLevelInMall ||
        // Only consider pure numeric/alpha patterns if they don't look like street addresses
        (!hasStreetKeyword &&
          !hasBuildingNumber &&
          (indicators.numericAlphaPattern.test(part) ||
            indicators.singleLetterPattern.test(part)))) &&
      !hasStreetKeyword &&
      !hasBuildingNumber;

    if (isSubpremise) {
      // For mall level cases, extract just the level part
      if (hasLevelInMall) {
        const levelMatch = part.match(/level\s+\d+/i);
        if (levelMatch) {
          subpremiseParts.push(levelMatch[0]);
        }
      } else {
        subpremiseParts.push(part);
      }
      foundSubpremise = true;
    } else if (foundSubpremise) {
      // Once we've found subpremises, any non-subpremise part ends the sequence
      remainingParts.push(...addressParts.slice(i));
      break;
    } else {
      remainingParts.push(part);
    }
  }

  const subpremisesRaw = subpremiseParts.length > 0 ? subpremiseParts.join(', ') : null;
  const remainingAddress = remainingParts.join(', ');

  return { subpremisesRaw, remainingAddress };
}

export function getAddressForQuery(
  address: string,
  locale: Locale = 'en'
): StructuredAddressComponents {
  console.log(`🔍 getAddressForQuery: Starting with "${address}" (locale: ${locale})`);

  // Test direction
  const isSmallToLarge =
    locale === 'en'
      ? isEnglishAddressSmallToLarge(address)
      : !isChineseAddressLargeToSmall(address);

  console.log(`🔍 getAddressForQuery: isSmallToLarge = ${isSmallToLarge}`);

  // Step 1: Remove geographic identifiers (country, region, district) first
  let cleaned = removeCountry(address, !(isSmallToLarge ?? true));
  console.log(`🔍 getAddressForQuery: After removeCountry: "${cleaned}"`);

  cleaned = removeRegion(cleaned, !(isSmallToLarge ?? true));
  console.log(`🔍 getAddressForQuery: After removeRegion: "${cleaned}"`);

  const district = extractDistrictFromAddress(cleaned, locale);
  console.log(`🔍 getAddressForQuery: Extracted district: "${district}"`);

  cleaned = removeDistrict(cleaned, !(isSmallToLarge ?? true));
  console.log(`🔍 getAddressForQuery: After removeDistrict: "${cleaned}"`);

  // Step 3: Extract neighbourhood from cleaned address
  const neighbourhood = extractNeighbourhoodFromAddress(
    cleaned,
    locale,
    isSmallToLarge ?? true
  );
  console.log(`🔍 getAddressForQuery: Extracted neighbourhood: "${neighbourhood}"`);

  // Step 3.5: Extract estate name from cleaned address
  let {
    estateName,
    phaseName,
    phaseNumber,
    blockType,
    blockNumber,
    blockTypeBeforeNumber,
    remainingAddress: estateRemainingAddress
  } = subtractEstateFromAddress(cleaned, locale);
  console.log(`🔍 getAddressForQuery: Extracted estateName: "${estateName}"`);

  // Step 3.6: Extract premises name from estate remaining address
  let { premisesName, remainingAddress: premisesRemainingAddress } =
    subtractPremisesFromAddress(estateRemainingAddress, locale);
  console.log(`🔍 getAddressForQuery: Extracted premisesName: "${premisesName}"`);

  // Step 3.7: Extract lot name from premises remaining address
  let {
    lotType,
    lotNumber,
    remainingAddress: lotRemainingAddress
  } = subtractLotFromAddress(premisesRemainingAddress);
  console.log(
    `🔍 getAddressForQuery: Extracted lotType: "${lotType}", lotNumber: "${lotNumber}"`
  );

  // Step 3.8: Extract building name from lot remaining address
  let { buildingName, remainingAddress: buildingRemainingAddress } =
    subtractBuildingFromAddress(lotRemainingAddress, locale);
  console.log(`🔍 getAddressForQuery: Extracted buildingName: "${buildingName}"`);

  // Step 3.9: Extract subpremises from remaining address (after geographic components removed)
  const { subpremisesRaw, remainingAddress: addressAfterSubpremises } =
    extractSubpremisesFromAddress(buildingRemainingAddress, locale);
  console.log(`🔍 getAddressForQuery: Extracted subpremises: "${subpremisesRaw}"`);

  // Step 4: Use streets data to identify and extract street components
  const { streetAddress, remainingAddress } = extractStreetFromAddress(
    addressAfterSubpremises,
    neighbourhood,
    locale
  );
  console.log(`🔍 getAddressForQuery: Extracted streetAddress: "${streetAddress}"`);
  console.log(`🔍 getAddressForQuery: Remaining address: "${remainingAddress}"`);

  // Step 5: Parse street address components using existing parsers
  let buildingNumberFrom: string | null = null;
  let buildingNumberTo: string | null = null;
  let streetName: string | null = null;
  let buildingNumbering: string | null = null;

  if (streetAddress) {
    if (locale === 'en') {
      // English parsing - simplified version of _parseStreetAddressEn
      const streetParts = streetAddress.split(' ');
      let streetStartIndex = 0;

      // Find where street name starts
      for (let i = 0; i < streetParts.length; i++) {
        const part = streetParts[i];
        const isNumber = /^\d+[a-zA-Z]?$/.test(part);
        const isSeparator = /^[,&\/\-–]+$/.test(part);

        if (!isNumber && !isSeparator) {
          streetStartIndex = i;
          break;
        }
      }

      if (streetStartIndex > 0) {
        const numberSegment = streetParts.slice(0, streetStartIndex).join(' ');
        const numberMatches = numberSegment.match(/\d+[a-zA-Z]?/g) || [];

        if (numberMatches.length > 0) {
          buildingNumberFrom = numberMatches[0];
          if (numberMatches.length > 1) {
            buildingNumberTo = numberMatches[numberMatches.length - 1];
            buildingNumbering = `${buildingNumberFrom}-${buildingNumberTo}`;
          } else {
            buildingNumbering = buildingNumberFrom;
          }
        }

        streetName = streetParts.slice(streetStartIndex).join(' ');
      } else {
        streetName = streetAddress;
      }
    } else {
      // Chinese parsing - simplified version of _parseStreetAddressZh
      const numberPattern = /([0-9]+[A-Za-z]*(?:號)?(?:-[0-9]+[A-Za-z]*(?:號)?)*)/;
      const numberMatch = streetAddress.match(numberPattern);

      if (numberMatch) {
        const numberPart = numberMatch[1].replace(/號/g, '');

        if (numberPart.includes('-')) {
          const parts = numberPart.split('-');
          buildingNumberFrom = parts[0];
          buildingNumberTo = parts[1];
          buildingNumbering = `${buildingNumberFrom}-${buildingNumberTo}`;
        } else {
          buildingNumberFrom = numberPart;
          buildingNumbering = buildingNumberFrom;
        }

        streetName = streetAddress.replace(numberMatch[0], '').trim();
      } else {
        streetName = streetAddress;
      }
    }
  }

  // Step 6: Get neighbourhood reference
  const neighbourhoodRef = getNeighbourhoodRef(neighbourhood, district, locale);

  // Step 7: Build query address (for geocoding)
  const queryAddress = getQueryAddress(
    estateName,
    phaseName,
    phaseNumber,
    blockType,
    blockNumber,
    blockTypeBeforeNumber,
    premisesName,
    buildingName,
    streetAddress,
    neighbourhood,
    district,
    locale
  );

  const result: StructuredAddressComponents = {
    queryAddress: queryAddress || '',
    streetAddress: streetAddress || '',
    streetName,
    buildingNumbering,
    buildingNumberFrom,
    buildingNumberTo,
    subpremisesRaw,
    neighbourhood,
    neighbourhoodRef,
    district,
    rawAddress: address
  };

  console.log(`🔍 getAddressForQuery: Final result:`, result);
  return result;
}

/**
 * Remove building numbers from street address to get clean street name
 * Reuses the logic from _parseStreetAddressEn in external/geocoding.ts
 *
 * @param streetAddress - The street address containing numbers and street name
 * @returns The street name without building numbers
 */
function removeBuildingNumbersFromStreet(streetAddress: string): string {
  if (!streetAddress || streetAddress.trim() === '') {
    return '';
  }

  // First, split by comma to handle cases like "123 Street, District"
  const commaParts = streetAddress.split(',').map((part) => part.trim());
  const firstPart = commaParts[0]; // Take only the first part before comma

  const streetParts = firstPart.split(' ');
  let streetStartIndex = 0;
  let isInNumberSequence = false;

  for (let i = 0; i < streetParts.length; i++) {
    const part = streetParts[i];

    // Check if this part is a number or number-related
    const isNumber = /^\d+[a-zA-Z]?$/.test(part);
    const isSeparator = /^[,&\/\-–]+$/.test(part);
    const isNumberWithSeparator = /^[\d,\-–&\/a-zA-Z]+$/.test(part) && /\d/.test(part);

    if (isNumber || isSeparator || isNumberWithSeparator) {
      isInNumberSequence = true;
    } else if (isInNumberSequence) {
      // We were in a number sequence but now found a non-number part
      // This is the start of the street name
      streetStartIndex = i;
      break;
    } else {
      // We're not in a number sequence and found a non-number part
      // This is the start of the street name
      streetStartIndex = i;
      break;
    }

    // If we've reached the end, check if we were in a number sequence
    if (i === streetParts.length - 1) {
      if (isInNumberSequence) {
        streetStartIndex = streetParts.length;
      }
    }
  }

  // Extract street name part (everything after the numbers)
  if (streetStartIndex < streetParts.length) {
    return streetParts.slice(streetStartIndex).join(' ').trim();
  } else {
    // No numbers found, treat entire string as street name
    return firstPart.trim();
  }
}

/**
 * Extract street name and first building number from a street address
 * Uses the same logic as _parseStreetAddressEn to extract the first number from a range
 *
 * @param streetAddress - The street address containing numbers and street name
 * @returns Object with streetName and firstBuildingNumber
 */
function extractStreetNameWithFirstNumber(streetAddress: string): {
  streetName: string;
  buildingNumberFrom: string;
} {
  if (!streetAddress || streetAddress.trim() === '') {
    return { streetName: '', buildingNumberFrom: '' };
  }

  // First, split by comma to handle cases like "123 Street, District"
  const commaParts = streetAddress.split(',').map((part) => part.trim());
  const firstPart = commaParts[0]; // Take only the first part before comma

  const streetParts = firstPart.split(' ');
  let streetStartIndex = 0;
  let isInNumberSequence = false;

  for (let i = 0; i < streetParts.length; i++) {
    const part = streetParts[i];

    // Check if this part is a number or number-related
    const isNumber = /^\d+[a-zA-Z]?$/.test(part);
    const isSeparator = /^[,&\/\-–]+$/.test(part);
    const isNumberWithSeparator = /^[\d,\-–&\/a-zA-Z]+$/.test(part) && /\d/.test(part);

    if (isNumber || isSeparator || isNumberWithSeparator) {
      isInNumberSequence = true;
    } else if (isInNumberSequence) {
      // We were in a number sequence but now found a non-number part
      // This is the start of the street name
      streetStartIndex = i;
      break;
    } else {
      // We're not in a number sequence and found a non-number part
      // This is the start of the street name
      streetStartIndex = i;
      break;
    }

    // If we've reached the end, check if we were in a number sequence
    if (i === streetParts.length - 1) {
      if (isInNumberSequence) {
        streetStartIndex = streetParts.length;
      }
    }
  }

  // Extract the street name part (everything after the numbers)
  const streetName =
    streetStartIndex < streetParts.length
      ? streetParts.slice(streetStartIndex).join(' ').trim()
      : '';

  // Extract the first building number from the number segment
  let buildingNumberFrom = '';
  if (streetStartIndex > 0) {
    const numberSegment = streetParts.slice(0, streetStartIndex).join(' ');
    const numberRegex = /^[\d\s,\-–&\/a-zA-Z]+$/;

    if (numberRegex.test(numberSegment)) {
      // Parse the number segment to extract individual numbers with letters
      const numberMatches = numberSegment.match(/\d+[a-zA-Z]?/g) || [];

      if (numberMatches.length > 0) {
        // Get the first number from the matches
        buildingNumberFrom = numberMatches[0];
      }
    }
  }

  return {
    streetName,
    buildingNumberFrom
  };
}

/**
 * Extract street components from address using streets.json data
 *
 * Process:
 * 1. Split address into segments
 * 2. Check each segment against English and Chinese street names
 * 3. Normalize abbreviations for comparison
 * 4. Return the best matching street and remaining address
 *
 * @param address - The cleaned address string
 * @param neighbourhood - The extracted neighbourhood (to exclude from street search)
 * @returns Object with extracted streetAddress and remainingAddress
 */
function extractStreetFromAddress(
  address: string,
  neighbourhood: string | null,
  locale: Locale = 'en'
): {
  streetAddress: string;
  remainingAddress: string;
} {
  console.log(
    `🔍 extractStreetFromAddress: Starting with "${address}", neighbourhood: "${neighbourhood}"`
  );

  // Split address into segments for analysis
  const segments = address
    .split(/[,;]/)
    .map((seg) => seg.trim())
    .filter((seg) => seg.length > 0);

  console.log(
    `🔍 extractStreetFromAddress: Segments: [${segments.map((s) => `"${s}"`).join(', ')}]`
  );

  let bestStreetMatch = '';
  let bestMatchScore = 0;
  let streetSegmentIndex = -1;

  // Check each segment against street names
  segments.forEach((segment, index) => {
    console.log(
      `🔍 extractStreetFromAddress: Checking segment "${segment}" (index ${index})`
    );

    // Skip neighbourhood segment if it was identified
    if (
      neighbourhood &&
      segment.toLowerCase().includes(neighbourhood.toLowerCase()) &&
      !segment.toLowerCase().endsWith('central') &&
      !segment.toLowerCase().endsWith('road')
    ) {
      console.log(
        `🔍 extractStreetFromAddress: Skipping segment "${segment}" (contains neighbourhood "${neighbourhood}")`
      );
      return;
    }

    const matchScore = calculateStreetMatchScore(segment, locale);
    console.log(
      `🔍 extractStreetFromAddress: Segment "${segment}" match score: ${matchScore}`
    );

    if (matchScore > bestMatchScore) {
      bestMatchScore = matchScore;
      bestStreetMatch = segment;
      streetSegmentIndex = index;
      console.log(
        `🔍 extractStreetFromAddress: New best match: "${segment}" (score: ${matchScore})`
      );
    }
  });

  console.log(
    `🔍 extractStreetFromAddress: Final best match: "${bestStreetMatch}" (score: ${bestMatchScore})`
  );

  // If we found a good street match, use it
  if (bestMatchScore > 0.5) {
    // Extract just the street name from the segment (remove building numbers)
    const streetNameOnly = removeBuildingNumbersFromStreet(bestStreetMatch);

    // Remove the street segment from the address
    const remainingSegments = segments.filter(
      (_, index) => index !== streetSegmentIndex
    );
    const remainingAddress = remainingSegments.join(', ');

    console.log(
      `🔍 extractStreetFromAddress: Good match found, extracted street name: "${streetNameOnly}", remainingAddress: "${remainingAddress}"`
    );

    return {
      streetAddress: bestStreetMatch,
      streetName: streetNameOnly,
      remainingAddress: remainingAddress
    };
  }

  // Fallback: if no good street match found, try to extract street name from the original address
  // const fallbackStreetName = removeBuildingNumbersFromStreet(address);
  console.log(
    `🔍 extractStreetFromAddress: No good match found (score: ${bestMatchScore})"`
  );

  return {
    streetAddress: null,
    remainingAddress: address
  };
}

export function isRunningSequence(
  numberMatches: string[],
  numberSegment: string
): { isRange: boolean; from?: string; to?: string } {
  if (numberMatches.length < 2) {
    return { isRange: false };
  }

  // Extract numeric values and letters for analysis
  const parsedNumbers = numberMatches.map((match) => {
    const numericPart = match.match(/\d+/)?.[0];
    const letterPart = match.match(/[a-zA-Z]/)?.[0];
    return {
      full: match,
      number: numericPart ? parseInt(numericPart, 10) : 0,
      letter: letterPart || ''
    };
  });

  // Check if all numbers have the same letter (or no letters)
  const letters = parsedNumbers.map((p) => p.letter);
  const hasConsistentLetters = letters.every((letter) => letter === letters[0]);

  // Check if this is a hyphen/em-dash separated range
  const hasHyphenRange = /[\-–]/.test(numberSegment) && numberMatches.length === 2;

  if (hasHyphenRange) {
    // It's a hyphen range, return the two numbers (letters can be different for hyphen ranges)
    return {
      isRange: true,
      from: numberMatches[0],
      to: numberMatches[1]
    };
  }

  // Check if this is a slash separated range (like 123/125)
  const hasSlashRange = /\//.test(numberSegment) && numberMatches.length === 2;

  if (hasSlashRange) {
    // It's a slash range, return the two numbers (letters can be different for slash ranges)
    return {
      isRange: true,
      from: numberMatches[0],
      to: numberMatches[1]
    };
  }

  // Check if this is an ampersand separated range (like 45 & 47)
  const hasAmpersandRange = /&/.test(numberSegment) && numberMatches.length === 2;

  if (hasAmpersandRange) {
    // It's an ampersand range, return the two numbers (letters can be different for ampersand ranges)
    return {
      isRange: true,
      from: numberMatches[0],
      to: numberMatches[1]
    };
  }

  // For comma-separated sequences, check if it's a running sequence
  const numbers = parsedNumbers.map((p) => p.number).sort((a, b) => a - b);
  const isConsecutive = numbers.every(
    (num, index) => index === 0 || num === numbers[index - 1] + 1
  );

  // Check if all numbers are odd or all are even
  const isAllOdd = numbers.every((num) => num % 2 === 1);
  const isAllEven = numbers.every((num) => num % 2 === 0);

  // Check if it's a consecutive odd/even sequence (like 1,3,5,7 or 2,4,6,8)
  const isConsecutiveOdd =
    isAllOdd &&
    numbers.every((num, index) => index === 0 || num === numbers[index - 1] + 2);
  const isConsecutiveEven =
    isAllEven &&
    numbers.every((num, index) => index === 0 || num === numbers[index - 1] + 2);

  // Only treat as range if it's consecutive OR consecutive odd/even with consistent letters
  // For truly non-consecutive sequences, treat as separate numbers
  if (
    (isConsecutive || isConsecutiveOdd || isConsecutiveEven) &&
    hasConsistentLetters &&
    numbers.length > 1
  ) {
    // Find the actual first and last numbers from the original order
    const firstNumber = parsedNumbers.reduce((min, current) =>
      current.number < min.number ? current : min
    );
    const lastNumber = parsedNumbers.reduce((max, current) =>
      current.number > max.number ? current : max
    );

    return {
      isRange: true,
      from: firstNumber.full,
      to: lastNumber.full
    };
  }

  return { isRange: false };
}

/**
 * Expand street suffixes in a segment that lacks spaces
 * Handles cases like "MainSt" -> "Main Street", "QueenRd" -> "Queen Road"
 *
 * @param segment - The address segment to expand
 * @returns The expanded segment with proper spacing
 */
function expandStreetSuffixes(segment: string): string {
  // Common street suffix abbreviations and their full forms
  const suffixExpansions = {
    rd: 'road',
    st: 'street',
    ln: 'lane',
    dr: 'drive',
    ave: 'avenue',
    pl: 'place',
    cl: 'close',
    ct: 'court',
    blvd: 'boulevard'
  };

  let expanded = segment.toLowerCase();

  // Try to match each suffix abbreviation
  for (const [abbrev, full] of Object.entries(suffixExpansions)) {
    // Check if segment ends with the abbreviation (but not if it's part of a longer word)
    if (expanded.endsWith(abbrev) && expanded.length > abbrev.length) {
      // Extract the part before the suffix
      const beforeSuffix = expanded.slice(0, -abbrev.length);

      // Only expand if the part before the suffix looks like a street name
      // (contains letters and is at least 2 characters long)
      if (beforeSuffix.length >= 2 && /^[a-z]+$/.test(beforeSuffix)) {
        expanded = beforeSuffix + ' ' + full;
        break;
      }
    }
  }

  return expanded;
}

/************
 * HELPER FUNCTIONS
 ************/

/**
 * Check if a street name is non-unique and append district if needed
 * @param streetName - The street name to check
 * @param district - The district to append if street is non-unique
 * @param locale - The locale for checking non-unique streets
 * @returns The street name with district appended if non-unique
 */
export function addDistrictForNonUniqueStreet(
  streetName: string,
  district: string | null,
  locale: Locale = 'en'
): string {
  if (!streetName || !district) {
    return streetName;
  }

  const nonUniqueNames = nonUniqueStreetNames[locale] || nonUniqueStreetNames.en;
  const isNonUnique = nonUniqueNames.some((nonUniqueName) =>
    streetName.toLowerCase().includes(nonUniqueName.toLowerCase())
  );

  if (isNonUnique) {
    return `${streetName}, ${district}`;
  }

  return streetName;
}

/**
 * Remove punctuation and normalize string for comparison
 */
function removePunctuation(str: string): string {
  return str
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate how well a segment matches known street names
 *
 * @param segment - The address segment to test
 * @returns Match score between 0 and 1 (1 = perfect match)
 */
export function calculateStreetMatchScore(
  segment: string,
  locale: Locale = 'en'
): number {
  console.log(
    `🔍 calculateStreetMatchScore: Checking segment "${segment}" (locale: ${locale})`
  );

  if (!segment || segment.trim() === '') {
    console.log(`🔍 calculateStreetMatchScore: Empty segment, returning 0`);
    return 0;
  }

  // Remove leading "No.", "Nos.", "No", "Nos" from the segment
  let cleanedSegment = segment.trim();
  const leadingNoPattern = /^(No\.?s?\.?\s*)/i;
  const noMatch = cleanedSegment.match(leadingNoPattern);
  if (noMatch) {
    cleanedSegment = cleanedSegment.replace(leadingNoPattern, '').trim();
    console.log(
      `🔍 calculateStreetMatchScore: Removed leading "${noMatch[1]}" from segment`
    );
  }

  // First, try to parse the segment to extract just the street name (without building numbers)
  const { streetName } = parseStreetAddress(cleanedSegment, locale);
  console.log(`🔍 calculateStreetMatchScore: Parsed street: "${streetName}"`);
  const testSegment = streetName || cleanedSegment;

  const normalizedSegment = reverseApplyAddressAbbreviations(testSegment);
  const lowerSegment = normalizedSegment.toLowerCase();
  const noPunctSegment = removePunctuation(lowerSegment);

  console.log(
    `🔍 calculateStreetMatchScore: Original: "${segment}", Parsed street: "${streetName}", Normalized: "${normalizedSegment}"`
  );

  if (locale === 'en') {
    // Check against English street names
    const englishStreets = streetsData.en || [];
    console.log(
      `🔍 calculateStreetMatchScore: Checking against ${englishStreets.length} English streets`
    );

    for (const street of englishStreets) {
      const lowerStreet = street.toLowerCase();
      const noPunctStreet = removePunctuation(lowerStreet);

      // Debug: Check if we're close to Jardine's Bazaar
      if (lowerSegment.includes('jardine') && lowerStreet.includes('jardine')) {
        console.log(
          `🔍 calculateStreetMatchScore: DEBUG - Comparing "${lowerSegment}" with "${lowerStreet}"`
        );
        console.log(
          `🔍 calculateStreetMatchScore: DEBUG - Segment length: ${lowerSegment.length}, Street length: ${lowerStreet.length}`
        );
        console.log(
          `🔍 calculateStreetMatchScore: DEBUG - Segment chars: [${Array.from(
            lowerSegment
          )
            .map((c) => c.charCodeAt(0))
            .join(', ')}]`
        );
        console.log(
          `🔍 calculateStreetMatchScore: DEBUG - Street chars: [${Array.from(
            lowerStreet
          )
            .map((c) => c.charCodeAt(0))
            .join(', ')}]`
        );
      }

      // Exact match
      if (lowerSegment === lowerStreet) {
        console.log(
          `🔍 calculateStreetMatchScore: Exact match found with "${street}", returning 1.0`
        );
        return 1.0;
      }

      // Exact match without punctuation
      if (noPunctSegment === noPunctStreet) {
        console.log(
          `🔍 calculateStreetMatchScore: Exact match (no punctuation) found with "${street}", returning 0.95`
        );
        return 0.95;
      }

      // Contains match (segment contains the street name)
      if (lowerSegment.includes(lowerStreet)) {
        console.log(
          `🔍 calculateStreetMatchScore: Contains match found with "${street}", returning 0.8`
        );
        return 0.8;
      }

      // Contains match without punctuation
      if (noPunctSegment.includes(noPunctStreet)) {
        console.log(
          `🔍 calculateStreetMatchScore: Contains match (no punctuation) found with "${street}", returning 0.75`
        );
        return 0.75;
      }

      // Street name contains the segment
      if (lowerStreet.includes(lowerSegment)) {
        console.log(
          `🔍 calculateStreetMatchScore: Reverse contains match found with "${street}", returning 0.6`
        );
        return 0.6;
      }

      // Street name contains the segment without punctuation
      if (noPunctStreet.includes(noPunctSegment)) {
        console.log(
          `🔍 calculateStreetMatchScore: Reverse contains match (no punctuation) found with "${street}", returning 0.55`
        );
        return 0.55;
      }

      // NEW: Handle street names without spaces (e.g., "MainSt" -> "Main Street")
      const expandedSegment = expandStreetSuffixes(lowerSegment);
      if (expandedSegment !== lowerSegment) {
        console.log(
          `🔍 calculateStreetMatchScore: Expanded segment "${lowerSegment}" to "${expandedSegment}"`
        );
        // Try matching the expanded version
        if (lowerStreet === expandedSegment) {
          console.log(
            `🔍 calculateStreetMatchScore: Expanded exact match found with "${street}", returning 0.9`
          );
          return 0.9; // High confidence for expanded matches
        }
        if (lowerStreet.includes(expandedSegment)) {
          console.log(
            `🔍 calculateStreetMatchScore: Expanded contains match found with "${street}", returning 0.7`
          );
          return 0.7;
        }
        if (expandedSegment.includes(lowerStreet)) {
          console.log(
            `🔍 calculateStreetMatchScore: Expanded reverse contains match found with "${street}", returning 0.7`
          );
          return 0.7;
        }
      }
    }

    // Check for common street suffixes (even if not in our database)
    const streetSuffixes = [
      ...(streetNameSuffixes || []),
      'rd',
      'st',
      'ln',
      'dr',
      'ave',
      'pl',
      'ct',
      'blvd',
      'way',
      'crescent',
      'close'
    ];
    const hasStreetSuffix = streetSuffixes.some((suffix) =>
      lowerSegment.endsWith(suffix)
    );

    if (hasStreetSuffix) {
      console.log(
        `🔍 calculateStreetMatchScore: Street suffix match found, returning 0.3`
      );
      return 0.3; // Lower confidence for suffix-only matches
    }
  } else {
    // Check against Chinese street names
    const chineseStreets = streetsData['zh-Hant'] || [];
    console.log(
      `🔍 calculateStreetMatchScore: Checking against ${chineseStreets.length} Chinese streets`
    );

    for (const street of chineseStreets) {
      const lowerStreet = street.toLowerCase();
      const noPunctStreet = removePunctuation(lowerStreet);

      // Exact match
      if (lowerSegment === lowerStreet) {
        console.log(
          `🔍 calculateStreetMatchScore: Exact match found with "${street}", returning 1.0`
        );
        return 1.0;
      }

      // Exact match without punctuation
      if (noPunctSegment === noPunctStreet) {
        console.log(
          `🔍 calculateStreetMatchScore: Exact match (no punctuation) found with "${street}", returning 0.95`
        );
        return 0.95;
      }

      // Contains match (segment contains the street name)
      if (lowerSegment.includes(lowerStreet)) {
        console.log(
          `🔍 calculateStreetMatchScore: Contains match found with "${street}", returning 0.8`
        );
        return 0.8;
      }

      // Contains match without punctuation
      if (noPunctSegment.includes(noPunctStreet)) {
        console.log(
          `🔍 calculateStreetMatchScore: Contains match (no punctuation) found with "${street}", returning 0.75`
        );
        return 0.75;
      }

      // Street name contains the segment
      if (lowerStreet.includes(lowerSegment)) {
        console.log(
          `🔍 calculateStreetMatchScore: Reverse contains match found with "${street}", returning 0.6`
        );
        return 0.6;
      }

      // Street name contains the segment without punctuation
      if (noPunctStreet.includes(noPunctSegment)) {
        console.log(
          `🔍 calculateStreetMatchScore: Reverse contains match (no punctuation) found with "${street}", returning 0.55`
        );
        return 0.55;
      }
    }
  }

  console.log(
    `🔍 calculateStreetMatchScore: No matches found for segment "${segment}", returning 0`
  );
  console.log(
    `🔍 calculateStreetMatchScore: Final debug - lowerSegment: "${lowerSegment}", length: ${lowerSegment.length}`
  );
  return 0;
}

export function toLocalParseResult(
  addressComponents: StructuredAddressComponents,
  locale: Locale = 'en'
) {
  const parsedSubPremises = parseSubPremisesComponent(
    addressComponents.subPremisesRaw,
    locale
  );
  return {
    addressMeta: { addressForwardGeocoder: 'invalid' },
    i18n: {
      en: {
        ...parsedSubPremises,
        rawAddress: addressComponents.queryAddress,
        streetAddress: addressComponents.streetAddress,
        streetName: addressComponents.streetName,
        estateName: addressComponents.estateName,
        premisesName: addressComponents.premisesName,
        buildingNumberFrom: addressComponents.buildingNumberFrom,
        buildingNumberTo: addressComponents.buildingNumberTo,
        neighbourhood: addressComponents.neighbourhood,
        district: addressComponents.district,
        region: districtionToRegion[addressComponents.district],
        country: regionToCountry[addressComponents.region]
      },
      'zh-hant': {},
      'zh-hans': {}
    }
  };
}
