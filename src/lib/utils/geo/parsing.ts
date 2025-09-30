// ************
// WORK IN PROGRESS :: PARSING UTILS FOR GEOCODING
// ************

// TYPES
import type { Locale } from '$lib/types';
// NORMALISATION
import {
  getStandardizedUnitType,
  getStandardizedUnitPortion
} from '$lib/utils/normalisation';

// ************
// PARSING :: UTILS
// ************

// TODO Implement a function which detects whether multiple addresses have been provided for lookup.
const isSingleAddress = (address: string, locale: Locale = 'en'): boolean | null => {
  return null;
};

const splitAddress = (address: string, locale: Locale = 'en'): string[] | null => {
  if (locale == 'en') {
    // Detect if the address is splittable by comma or semicolon
    if (address.includes(',') || address.includes(';')) {
      return address.split(/[,;]/);
    } else {
      return [address];
    }
  } else {
    // TODO Add support for Chinese Splitting
    return [address];
  }
};

// TODO Move directionDetection Here

// TODO Create a function that estimates the probability that split parts of an address are address components, and merge components if they are of the same type (i.e. accidentially split numbering of addresses.)

// ************
// PARSING :: COUNTRY
// ************

/**
 * Given a full address, extract the country component.
 * @param address - The full address to extract the country from.
 * @param locale - The locale of the address.
 * @returns The country component of the address.
 */
export const getCountryFromAddress = (
  address: string,
  locale: Locale = 'en'
): string | null => {
  return null;
};

export const removeCountryComponentFromAddress = (
  address: string,
  locale: Locale = 'en'
): {
  country: string | null;
  rawCountry: string | null;
  remainder: string | null;
} | null => {
  return { country: null, rawCountry: null, remainder: null };
};

export const getCountryFromComponent = (component: string): string | null => {
  return null;
};

export const parseCountry = (address: string): string | null => {
  return null;
};

// ************
// PARSING :: REGION
// ************

// ************
// PARSING :: DISTRICT
// ************

// ************
// PARSING :: NEIGHBOURHOOD
// ************

// ************
// PARSING :: STREET ADDRESSES
// ************

// ************
// PARSING :: ESTATE
// ************

// ************
// PARSING :: PREMISES
// ************

// ************
// PARSING :: SUBPREMISES
// ************

// Parse subPremises into structured components
export function parseSubPremisesComponent(
  subPremises: string | null | undefined,
  sourceLocale: Locale,
  targetLocale: Locale = 'en'
) {
  console.log(
    `🗺️ GeoLookupStep: Parsing subPremises: "${subPremises}" (${sourceLocale} -> ${targetLocale})`
  );

  const result = {
    unitPortion: undefined as string | undefined,
    unitNumber: undefined as string | undefined,
    unitType: undefined as string | undefined,
    floorNumber: undefined as string | undefined,
    floorType: undefined as string | undefined
  };

  if (!subPremises) {
    return result;
  }

  // Split the subpremises by comma to handle multiple components
  const parts = subPremises.split(',').map((part) => part.trim());

  // Floor patterns with priority order (most specific first)
  const floorPatterns = [
    // Complex multi-floor patterns with ranges and combinations
    {
      pattern: /^(basement\s*-\s*\d+\/f)$/i,
      type: '$1',
      number: null
    },
    {
      pattern: /^(basement\s*&\s*g\/f)(?:\s+portion)?$/i,
      type: 'Basement & G/F',
      number: null
    },
    {
      pattern: /^(lg\/f\s*&\s*g\/f|lg\/f\s*and\s*g\/f|lower\s+ground\s*&\s*ground)$/i,
      type: 'LG/F & G/F',
      number: null
    },
    {
      pattern: /^(ug\/f\s*&\s*g\/f|ug\/f\s*and\s*g\/f|upper\s+ground\s*&\s*ground)$/i,
      type: 'UG/F & G/F',
      number: null
    },
    {
      pattern: /^g\/f\s+entrance\s+plus\s+basement$/i,
      type: 'Basement & Ground',
      number: null
    },

    // Special floor descriptions with "the whole of"
    {
      pattern: /^the\s+whole\s+of\s+basement$/i,
      type: 'Basement',
      number: null
    },

    // Level patterns with ranges
    {
      pattern: /^levels?\s+([\d\s&\-–]+)$/i,
      type: 'Level',
      number: '$1'
    },

    // Full floor descriptions
    {
      pattern: /^upper\s+ground\s+floor$/i,
      type: 'Upper Ground',
      number: null
    },
    {
      pattern: /^lower\s+ground\s+floor$/i,
      type: 'Lower Ground',
      number: null
    },
    {
      pattern: /^ground\s+floor$/i,
      type: 'Ground',
      number: null
    },

    // Simple level patterns
    { pattern: /^l(\d+)$/i, type: 'Level', number: '$1' },
    { pattern: /^lg$/i, type: 'Lower Ground', number: null },

    // Specific floor abbreviations with numbers
    { pattern: /^(\d+)\/f$/i, type: 'Floor', number: '$1' },
    { pattern: /^(\d+)f$/i, type: 'Floor', number: '$1' },

    // Specific floor types with numbers
    { pattern: /^floor\s+(\d+)$/i, type: 'Floor', number: '$1' },
    { pattern: /^level\s+(\d+)$/i, type: 'Level', number: '$1' },
    { pattern: /^l\/f\s*(\d+)$/i, type: 'Level', number: '$1' },
    { pattern: /^(\d+)\s*l\/f$/i, type: 'Level', number: '$1' },
    { pattern: /^basement\s+(\d+)$/i, type: 'Basement', number: '$1' },
    { pattern: /^b\/f\s*(\d+)$/i, type: 'Basement', number: '$1' },
    { pattern: /^(\d+)\s*b\/f$/i, type: 'Basement', number: '$1' },

    // Floor types without numbers
    { pattern: /^g\/f$/i, type: 'Ground', number: null },
    { pattern: /^ground\s*floor?$/i, type: 'Ground', number: null },
    { pattern: /^lg\/f$/i, type: 'Lower Ground', number: null },
    { pattern: /^lower\s+ground$/i, type: 'Lower Ground', number: null },
    { pattern: /^ug\/f$/i, type: 'Upper Ground', number: null },
    { pattern: /^upper\s+ground$/i, type: 'Upper Ground', number: null },
    { pattern: /^m\/f$/i, type: 'Mezzanine', number: null },
    { pattern: /^mezzanine$/i, type: 'Mezzanine', number: null },
    { pattern: /^b\/f$/i, type: 'Basement', number: null },
    { pattern: /^basement$/i, type: 'Basement', number: null },
    { pattern: /^r\/f$/i, type: 'Roof', number: null },
    { pattern: /^roof$/i, type: 'Roof', number: null },
    { pattern: /^level$/i, type: 'Level', number: null },
    { pattern: /^l\/f$/i, type: 'Level', number: null },
    { pattern: /^podium$/i, type: 'Podium', number: null }
  ];

  // Unit patterns
  const unitPatterns = [
    // Complex multi-floor unit patterns (most specific first)
    {
      pattern:
        /^all\s+shops?\s+nos?\.?\s*([\d\w\s,&\-–]+)\s+and\s+.*?on\s+level\s+(\d+)$/i,
      type: 'Shop',
      number: '$1'
    },
    {
      pattern:
        /^shops?\s+nos?\.?\s*([\d\w\s,&\-–]+)\s+on\s+(\d+)\/f\s+and\s+shops?\s+nos?\.?\s*([\d\w\s,&\-–]+)\s+on\s+(\d+)\/f$/i,
      type: 'Shop',
      number: '$1;$3'
    },
    {
      pattern:
        /^units?\s+(\d+)\s+to\s+(\d+)\s+and\s+(\d+)\s+to\s+(\d+)\s+on\s+level\s+(\d+)\s+and\s+units?\s+(\d+)\s+to\s+(\d+)\s+and\s+(\d+)\s+to\s+(\d+)\s+on\s+level\s+(\d+)$/i,
      type: 'Unit',
      number: '$1-$2 & $3-$4;$6-$7 & $8-$9'
    },
    {
      pattern:
        /^shops?\s+nos?\.?\s*([\d\w\s,&\-–]+)\s+and\s+entrance\s+lobby\s+on\s+level\s+(\d+)$/i,
      type: 'Shop',
      number: '$1'
    },

    // Special unit patterns with floor indicators
    {
      pattern: /^shops?\s+no\.?\s*([\w\d]+)\s+on\s+basement\s+(\d+)\s+floor$/i,
      type: 'Shop',
      number: '$1'
    },
    {
      pattern: /^shops?\s+unit\s+([\w\d\-–&\s,]+)$/i,
      type: 'Shop',
      number: '$1'
    },
    {
      pattern: /^shops?\s+units\s+([\w\d\-–&\s,]+)$/i,
      type: 'Shop',
      number: '$1'
    },
    {
      pattern: /^shops?\s+([\w\d\-–]+)\s+on\s+g\/f$/i,
      type: 'Shop',
      number: '$1'
    },

    // "No." patterns (most specific first)
    {
      pattern: /^shops?\s+nos?\.?\s*([\w\d]+)\s+and\s*([\w\d]+)$/i,
      type: 'Shop',
      number: '$1 & $2'
    },
    {
      pattern: /^shops?\s+nos?\.?\s*([\d\w\s,&\-–]+)\s+and\s*([\d\w\s,&\-–]+)$/i,
      type: 'Shop',
      number: '$1 & $2'
    },
    { pattern: /^shops?\s+no\.?\s*([\d\w\s,&\-–]+)$/i, type: 'Shop', number: '$1' },
    { pattern: /^suites?\s+no\.?\s*([\d\w\s,&\-–]+)$/i, type: 'Suite', number: '$1' },
    { pattern: /^units?\s+no\.?\s*([\d\w\s,&\-–]+)$/i, type: 'Unit', number: '$1' },
    { pattern: /^flats?\s+no\.?\s*([\d\w\s,&\-–]+)$/i, type: 'Flat', number: '$1' },
    { pattern: /^rooms?\s+no\.?\s*([\d\w\s,&\-–]+)$/i, type: 'Room', number: '$1' },
    { pattern: /^offices?\s+no\.?\s*([\d\w\s,&\-–]+)$/i, type: 'Office', number: '$1' },

    // Unit with floor patterns (specific combinations)
    { pattern: /^units?\s+([\d\w\s,&\-–]+)\s+lg\/f$/i, type: 'Unit', number: '$1' },
    { pattern: /^units?\s+([\d\w\s,&\-–]+)\s+ug\/f$/i, type: 'Unit', number: '$1' },
    { pattern: /^units?\s+([\d\w\s,&\-–]+)\s+g\/f$/i, type: 'Unit', number: '$1' },
    { pattern: /^units?\s+([\d\w\s,&\-–]+)\s+b\/f$/i, type: 'Unit', number: '$1' },
    { pattern: /^shops?\s+([\d\w\s,&\-–]+)\s+lg\/f$/i, type: 'Shop', number: '$1' },
    { pattern: /^shops?\s+([\d\w\s,&\-–]+)\s+ug\/f$/i, type: 'Shop', number: '$1' },
    { pattern: /^shops?\s+([\d\w\s,&\-–]+)\s+g\/f$/i, type: 'Shop', number: '$1' },
    { pattern: /^shops?\s+([\d\w\s,&\-–]+)\s+b\/f$/i, type: 'Shop', number: '$1' },

    // Complex unit patterns with ranges and multiple units
    { pattern: /^shops?\s+([\d\w\s,&\-–]+)$/i, type: 'Shop', number: '$1' },
    { pattern: /^suites?\s+([\d\w\s,&\-–]+)$/i, type: 'Suite', number: '$1' },
    { pattern: /^units?\s+([\d\w\s,&\-–]+)$/i, type: 'Unit', number: '$1' },
    { pattern: /^flats?\s+([\d\w\s,&\-–]+)$/i, type: 'Flat', number: '$1' },
    { pattern: /^rooms?\s+([\d\w\s,&\-–]+)$/i, type: 'Room', number: '$1' },
    { pattern: /^offices?\s+([\d\w\s,&\-–]+)$/i, type: 'Office', number: '$1' },

    // Simple unit patterns
    { pattern: /^shop\s+([a-z\d\-–&\s,]+)$/i, type: 'Shop', number: '$1' },
    { pattern: /^suite\s+([a-z\d\-–&\s,]+)$/i, type: 'Suite', number: '$1' },
    { pattern: /^unit\s+([a-z\d\-–&\s,]+)$/i, type: 'Unit', number: '$1' },
    { pattern: /^flat\s+([a-z\d\-–&\s,]+)$/i, type: 'Flat', number: '$1' },
    { pattern: /^room\s+([a-z\d\-–&\s,]+)$/i, type: 'Room', number: '$1' },
    { pattern: /^office\s+([a-z\d\-–&\s,]+)$/i, type: 'Office', number: '$1' },

    // Special unit number patterns (for cases like P27)
    { pattern: /^([a-z]\d+)$/i, type: undefined, number: '$1' }
  ];

  // First, try to match the entire subpremises string for complex multi-floor patterns
  const fullString = subPremises.toLowerCase().trim();

  // Handle "All Shops Nos. X and portion of Corridor on Level Y" pattern
  const allShopsMatch = fullString.match(
    /^all\s+shops?\s+nos?\.?\s*([\d\w\s,&\-–]+)\s+and\s+.*?on\s+level\s+(\d+)/i
  );
  if (allShopsMatch) {
    result.unitType = 'Shop';
    result.unitNumber = allShopsMatch[1].trim(); // Keep original format
    result.floorType = 'Level';
    result.floorNumber = allShopsMatch[2];
    console.log('🗺️ GeoLookupStep: Parsed subPremises result:', result);
    return result;
  }

  // Handle complex multi-floor unit combinations
  const multiFloorUnitMatch = fullString.match(
    /^units?\s+(\d+)\s+to\s+(\d+)\s+and\s+(\d+)\s+to\s+(\d+)\s+on\s+level\s+(\d+)\s+and\s+units?\s+(\d+)\s+to\s+(\d+)\s+and\s+(\d+)\s+to\s+(\d+)\s+on\s+level\s+(\d+)/i
  );
  if (multiFloorUnitMatch) {
    result.unitType = 'Unit';
    result.unitNumber = `${multiFloorUnitMatch[1]}-${multiFloorUnitMatch[2]} & ${multiFloorUnitMatch[3]}-${multiFloorUnitMatch[4]};${multiFloorUnitMatch[6]}-${multiFloorUnitMatch[7]} & ${multiFloorUnitMatch[8]}-${multiFloorUnitMatch[9]}`;
    result.floorType = 'Level';
    result.floorNumber = `${multiFloorUnitMatch[5]};${multiFloorUnitMatch[10]}`;
    console.log('🗺️ GeoLookupStep: Parsed subPremises result:', result);
    return result;
  }

  // Handle shop numbers on multiple floors
  const multiFloorShopMatch = fullString.match(
    /^shops?\s+nos?\.?\s*([\d\w\s,&\-–]+)\s+on\s+(\d+)\/f\s+and\s+shops?\s+nos?\.?\s*([\d\w\s,&\-–]+)\s+on\s+(\d+)\/f/i
  );
  if (multiFloorShopMatch) {
    result.unitType = 'Shop';
    result.unitNumber = `${multiFloorShopMatch[1].trim()};${multiFloorShopMatch[3].trim()}`;
    result.floorType = 'Floor';
    result.floorNumber = `${multiFloorShopMatch[2]};${multiFloorShopMatch[4]}`;
    console.log('🗺️ GeoLookupStep: Parsed subPremises result:', result);
    return result;
  }

  // Handle shop with entrance lobby on multiple levels
  const shopLobbyMatch = fullString.match(
    /^shops?\s+nos?\.?\s*(\d+),?\s+level\s+(\d+)\s+and\s+entrance\s+lobby\s+on\s+level\s+(\d+)/i
  );
  if (shopLobbyMatch) {
    result.unitType = 'Shop';
    result.unitNumber = shopLobbyMatch[1];
    result.floorType = 'Level';
    result.floorNumber = `${shopLobbyMatch[3]};${shopLobbyMatch[2]}`;
    console.log('🗺️ GeoLookupStep: Parsed subPremises result:', result);
    return result;
  }

  // Handle special case: "Shops X on G/F" pattern
  const shopsOnFloorMatch = subPremises.match(
    /^shops?\s+([\w\d\-–]+)\s+on\s+(g\/f|lg\/f|ug\/f|b\/f|m\/f)$/i
  );
  if (shopsOnFloorMatch) {
    result.unitType = 'Shop';
    result.unitNumber = shopsOnFloorMatch[1];

    const floorAbbrev = shopsOnFloorMatch[2].toLowerCase();
    switch (floorAbbrev) {
      case 'lg/f':
        result.floorType = 'Lower Ground';
        break;
      case 'ug/f':
        result.floorType = 'Upper Ground';
        break;
      case 'g/f':
        result.floorType = 'Ground';
        break;
      case 'b/f':
        result.floorType = 'Basement';
        break;
      case 'm/f':
        result.floorType = 'Mezzanine';
        break;
      default:
        result.floorType = floorAbbrev.toUpperCase();
    }

    console.log('🗺️ GeoLookupStep: Parsed subPremises result:', result);
    return result;
  }

  // Handle special case: "Shop No. X G/F" pattern (no comma)
  const shopNoFloorMatch = subPremises.match(
    /^shops?\s+no\.?\s*([\w\d]+)\s+(g\/f|lg\/f|ug\/f|b\/f|m\/f)$/i
  );
  if (shopNoFloorMatch) {
    result.unitType = 'Shop';
    result.unitNumber = shopNoFloorMatch[1];

    const floorAbbrev = shopNoFloorMatch[2].toLowerCase();
    switch (floorAbbrev) {
      case 'lg/f':
        result.floorType = 'Lower Ground';
        break;
      case 'ug/f':
        result.floorType = 'Upper Ground';
        break;
      case 'g/f':
        result.floorType = 'Ground';
        break;
      case 'b/f':
        result.floorType = 'Basement';
        break;
      case 'm/f':
        result.floorType = 'Mezzanine';
        break;
      default:
        result.floorType = floorAbbrev.toUpperCase();
    }

    console.log('🗺️ GeoLookupStep: Parsed subPremises result:', result);
    return result;
  }

  // Handle special case: "Shop No. X on Basement Y Floor" pattern
  const shopBasementMatch = subPremises.match(
    /^shops?\s+no\.?\s*([\w\d]+)\s+on\s+basement\s+(\d+)\s+floor$/i
  );
  if (shopBasementMatch) {
    result.unitType = 'Shop';
    result.unitNumber = shopBasementMatch[1];
    result.floorType = 'Basement';
    result.floorNumber = shopBasementMatch[2];
    console.log('🗺️ GeoLookupStep: Parsed subPremises result:', result);
    return result;
  }

  // Handle special case: "Shop Nos. X and Y, G/F" pattern (unit and floor across parts)
  const shopNosAndMatch = subPremises.match(
    /^shops?\s+nos?\.?\s*([\w\d]+)\s+and\s*([\w\d]+),?\s+(g\/f|lg\/f|ug\/f|b\/f|m\/f)$/i
  );
  if (shopNosAndMatch) {
    result.unitType = 'Shop';
    result.unitNumber = `${shopNosAndMatch[1]} & ${shopNosAndMatch[2]}`;

    const floorAbbrev = shopNosAndMatch[3].toLowerCase();
    switch (floorAbbrev) {
      case 'lg/f':
        result.floorType = 'Lower Ground';
        break;
      case 'ug/f':
        result.floorType = 'Upper Ground';
        break;
      case 'g/f':
        result.floorType = 'Ground';
        break;
      case 'b/f':
        result.floorType = 'Basement';
        break;
      case 'm/f':
        result.floorType = 'Mezzanine';
        break;
      default:
        result.floorType = floorAbbrev.toUpperCase();
    }

    console.log('🗺️ GeoLookupStep: Parsed subPremises result:', result);
    return result;
  }

  // Handle special case: "Unit X LG/F" pattern (unit and floor in same part)
  for (const part of parts) {
    const unitFloorMatch = part.match(
      /^(units?|shops?|suites?|flats?|rooms?|offices?)\s+([\d\w\s,&\-–]+)\s+(lg\/f|ug\/f|g\/f|b\/f|m\/f)$/i
    );
    if (unitFloorMatch) {
      result.unitType =
        unitFloorMatch[1].charAt(0).toUpperCase() +
        unitFloorMatch[1].slice(1).replace(/s$/, '');
      result.unitNumber = unitFloorMatch[2]
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\s*&\s*/g, ' & ')
        .replace(/\s*and\s*/gi, ' & ')
        .replace(/\s*to\s*/gi, '-')
        .replace(/\s*-\s*/g, '-');

      const floorAbbrev = unitFloorMatch[3].toLowerCase();
      switch (floorAbbrev) {
        case 'lg/f':
          result.floorType = 'Lower Ground';
          break;
        case 'ug/f':
          result.floorType = 'Upper Ground';
          break;
        case 'g/f':
          result.floorType = 'Ground';
          break;
        case 'b/f':
          result.floorType = 'Basement';
          break;
        case 'm/f':
          result.floorType = 'Mezzanine';
          break;
        default:
          result.floorType = floorAbbrev.toUpperCase();
      }

      console.log('🗺️ GeoLookupStep: Parsed subPremises result:', result);
      return result;
    }
  }

  // Process each part
  let unitNumbers: string[] = [];
  let hasFoundUnit = false;

  for (const part of parts) {
    // Try to match floor patterns
    let floorMatched = false;
    for (const { pattern, type, number } of floorPatterns) {
      const match = part.match(pattern);
      if (match) {
        // Handle dynamic type assignment
        if (type.startsWith('$')) {
          const groupIndex = parseInt(type.substring(1));
          result.floorType = match[groupIndex] || type;
        } else {
          result.floorType = type;
        }

        if (number && number.startsWith('$')) {
          const groupIndex = parseInt(number.substring(1));
          result.floorNumber = match[groupIndex] || undefined;
        } else if (number) {
          result.floorNumber = number;
        }
        floorMatched = true;
        break;
      }
    }

    // Try to match unit patterns if not a floor
    if (!floorMatched) {
      for (const { pattern, type, number } of unitPatterns) {
        const match = part.match(pattern);
        if (match) {
          if (!hasFoundUnit) {
            result.unitType = type;
            hasFoundUnit = true;
          }

          if (number && number.startsWith('$')) {
            const groupIndex = parseInt(number.substring(1));
            let unitNumber = match[groupIndex] || '';

            // Handle semicolon-separated multi-floor units
            if (unitNumber.includes(';')) {
              unitNumbers.push(unitNumber);
            } else {
              // Clean up unit number - remove extra spaces, normalize separators
              unitNumber = unitNumber
                .trim()
                .replace(/\s+/g, ' ')
                .replace(/\s*&\s*/g, ' & ')
                .replace(/\s*and\s*/gi, ' & ')
                .replace(/\s*to\s*/gi, '-')
                .replace(/\s*-\s*/g, '-');
              unitNumbers.push(unitNumber);
            }
          }
          break;
        }
      }

      // If no unit pattern matched but we have a unit type, check if this part is just a unit number
      if (hasFoundUnit && unitNumbers.length > 0) {
        const numberMatch = part.match(/^([\d\w\s,&\-–]+)$/);
        if (
          numberMatch &&
          !numberMatch[1].toLowerCase().includes('shop') &&
          !numberMatch[1].toLowerCase().includes('unit')
        ) {
          let unitNumber = numberMatch[1]
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/\s*&\s*/g, ' & ')
            .replace(/\s*and\s*/gi, ' & ')
            .replace(/\s*to\s*/gi, '-')
            .replace(/\s*-\s*/g, '-');
          unitNumbers.push(unitNumber);
        }
      }
    }
  }

  // Combine unit numbers, but avoid duplicates
  if (unitNumbers.length > 0) {
    // Remove duplicates
    const uniqueNumbers = [...new Set(unitNumbers)];
    result.unitNumber = uniqueNumbers.join(' & ');
  }

  // Handle special cases for unit numbers without explicit unit types
  if (!result.unitType && !result.floorType && !result.unitNumber) {
    // Check if it's a simple unit identifier like "P27"
    const simpleUnitMatch = subPremises.match(/^([a-z]\d+)$/i);
    if (simpleUnitMatch) {
      result.unitNumber = simpleUnitMatch[1];
    }
  }

  // Handle special case: "P27, Podium" - unit number with floor type but no unit type
  if (!result.unitType && result.floorType && !result.unitNumber) {
    // Only assign unit number if the floor type is "Podium" (specific case)
    if (result.floorType === 'Podium') {
      for (const part of parts) {
        const unitMatch = part.match(/^([a-z]\d+)$/i);
        if (unitMatch) {
          result.unitNumber = unitMatch[1];
          break;
        }
      }
    }
  }

  // Handle special cases for building names that got included
  if (
    result.unitNumber &&
    /\b(building|centre|center|house|tower|mall|plaza)\b/i.test(result.unitNumber)
  ) {
    // If unit number contains building-like words, it's probably not a unit number
    result.unitNumber = undefined;
  }

  console.log('🗺️ GeoLookupStep: Parsed subPremises result:', result);
  return result;
}

// Parse Hong Kong lot information
export function parseLot(lotString: string | null | undefined) {
  const result = {
    lotType: undefined as string | undefined,
    lotNumber: undefined as string | undefined,
    demarcationDistrict: undefined as string | undefined
  };

  if (!lotString) {
    return result;
  }

  // Hong Kong lot type patterns
  const lotPatterns = [
    // DD lots with demarcation district
    {
      pattern: /^dd(\d{1,3}),?\s*lot\s+(\d+)$/i,
      type: 'DD',
      number: '$2',
      district: '$1'
    },
    {
      pattern: /^dd(\d{1,3})\s+(\d+)$/i,
      type: 'DD',
      number: '$2',
      district: '$1'
    },

    // Other lot types with optional dots
    {
      pattern:
        /^(ap|ccl|cl|ctl|el|fsstl|ftl|il|kctl|kil|ltl|ml|mtl|nkil|rl|rbl|sl|shtl|sttl|tctl|tml|tol|ttl|twtl|yll)\.?\s*(\d+)$/i,
      type: '$1',
      number: '$2',
      district: null
    },
    {
      pattern: /^([a-z])\.([a-z])\.([a-z])\.([a-z])\.?\s*(\d+)$/i,
      type: 'CUSTOM_4',
      number: '$5',
      district: null
    },
    {
      pattern: /^([a-z])\.([a-z])\.([a-z])\.?\s*(\d+)$/i,
      type: 'CUSTOM_3',
      number: '$4',
      district: null
    },
    {
      pattern: /^([a-z])\.([a-z])\.?\s*(\d+)$/i,
      type: 'CUSTOM_2',
      number: '$3',
      district: null
    }
  ];

  const cleanLotString = lotString.toLowerCase().trim();

  for (const { pattern, type, number, district } of lotPatterns) {
    const match = cleanLotString.match(pattern);
    if (match) {
      // Handle dynamic type assignment
      if (type.startsWith('$')) {
        const groupIndex = parseInt(type.substring(1));
        result.lotType = match[groupIndex]?.toUpperCase();
      } else if (type === 'CUSTOM_4') {
        result.lotType = `${match[1]}${match[2]}${match[3]}${match[4]}`.toUpperCase();
      } else if (type === 'CUSTOM_3') {
        result.lotType = `${match[1]}${match[2]}${match[3]}`.toUpperCase();
      } else if (type === 'CUSTOM_2') {
        result.lotType = `${match[1]}${match[2]}`.toUpperCase();
      } else {
        result.lotType = type.toUpperCase();
      }

      // Handle lot number
      if (number.startsWith('$')) {
        const groupIndex = parseInt(number.substring(1));
        result.lotNumber = match[groupIndex];
      }

      // Handle demarcation district
      if (district && district.startsWith('$')) {
        const groupIndex = parseInt(district.substring(1));
        result.demarcationDistrict = match[groupIndex];
      }

      break;
    }
  }

  return result;
}

// ************
// PARSING :: FLOOR
// ************

// ************
// PARSING :: UNIT
// ************
