// Utils
import { toUpperCase, toTitleCase } from '../index';
// Normalisation
import {
  unitTypeAbbreviations,
  floorTypeAbbreviations,
  buildingAbbreviations,
  streetnameAbbreviations,
  estateAbbreviations,
  getNormalisedDistrict,
  getNormalisedRegion,
  floorTypeI18n
} from './normalisation';
// Types
import type { AddressProperties, Locale } from '../types';

// ************
// DISPLAY :: UNIT
// ************

// COMPONENT :: unitPortion, unitNumber, unitType

export function normaliseUnitForDisplayEn(
  addressProperties: AddressProperties
): string {
  if (!addressProperties.unitType && !addressProperties.unitNumber) {
    return '';
  }
  let unitType = addressProperties.unitType || '';
  if (!addressProperties.unitType && addressProperties.unitNumber) {
    unitType = 'Rm'; // Ensure numbers have a default unit type of Room
  }
  Object.entries(unitTypeAbbreviations).forEach(([full, abbrev]) => {
    const regex = new RegExp(`\\b${full}\\b`, 'gi');
    unitType = unitType.replace(regex, abbrev);
  });
  const unitId = toUpperCase(addressProperties.unitNumber || '');
  const portion = addressProperties.unitPortion || '';
  return `${toTitleCase(unitType)} ${toUpperCase(unitId)} ${toTitleCase(portion)}`.trim();
}

export function normaliseUnitForDisplayZh(
  addressProperties: AddressProperties,
  locale: Locale = 'zh-hant'
): string {
  let unitType = addressProperties.unitType || '';
  let unitId = addressProperties.unitNumber || '';
  let portion = addressProperties.unitPortion || '';

  if (!unitId) {
    return '';
  }

  // Map English unit types to Chinese suffixes that get appended to the number
  const unitTypeSuffixMap: Record<string, string> = {
    room: '室',
    unit: '號',
    flat: '號',
    shop: '號鋪',
    suite: '號房',
    office: '號'
  };

  // Get the appropriate Chinese suffix
  let chineseSuffix = '';
  if (unitType) {
    const normalizedType = unitType.toLowerCase();
    chineseSuffix = unitTypeSuffixMap[normalizedType] || '號';
  } else {
    // Default to 號 if no unit type specified
    chineseSuffix = '號';
  }

  // Format: [portion] + unitNumber + chineseSuffix
  const formattedUnit = `${unitId}${chineseSuffix}`;

  if (portion) {
    return `${portion} ${formattedUnit}`.trim();
  } else {
    return formattedUnit;
  }
}

// ************
// DISPLAY :: FLOOR
// ************

// COMPONENT :: floorNumber, floorType,

export function normaliseFloorForDisplayEn(
  addressProperties: AddressProperties
): string {
  if (!addressProperties.floorNumber && !addressProperties.floorType) {
    return '';
  }

  let levelId = addressProperties.floorNumber || '';
  let levelType = addressProperties.floorType || 'F';

  // Handle compound floor types first (most specific to least specific)
  const compoundFloorTypes = {
    'Upper Ground': 'UG',
    'Lower Ground': 'LG',
    'Lower Parking': 'LP',
    'Parking Ramp': 'PR'
  };

  // Check for compound types first
  for (const [compound, abbrev] of Object.entries(compoundFloorTypes)) {
    if (levelType.toLowerCase() === compound.toLowerCase()) {
      levelType = abbrev;
      break;
    }
  }

  // Then handle single word abbreviations
  Object.entries(floorTypeAbbreviations).forEach(([abbrev, full]) => {
    // Only replace if it's an exact match to avoid partial replacements
    if (levelType.toLowerCase() === full.toLowerCase()) {
      levelType = abbrev;
    }
  });

  // Handle special abbreviation cases
  const abbreviatedTypes = ['G', 'B', 'M', 'UG', 'LG', 'U', 'P'];
  if (abbreviatedTypes.includes(levelType.toUpperCase())) {
    const abbrevType = levelType.toUpperCase();

    // Ground floor is always G/F regardless of number
    if (abbrevType === 'G' || (levelId === '0' && levelType === 'F')) {
      return 'G/F';
    }

    // Other abbreviated types with numbers
    if (levelId && levelId !== '0') {
      return `${abbrevType}${levelId}/F`;
    } else {
      return `${abbrevType}/F`;
    }
  }

  // Handle full-name floor types (Concourse, Level, Lower Parking, Pantry, Parking Ramp, Roof, Terrace)
  const fullNameTypes = [
    'Concourse',
    'Level',
    'Lower Parking',
    'Pantry',
    'Parking Ramp',
    'Roof',
    'Terrace'
  ];
  const matchedFullType = fullNameTypes.find(
    (type) =>
      levelType.toLowerCase() === type.toLowerCase() ||
      levelType.toLowerCase() === type.toLowerCase().replace(/\s+/g, '')
  );

  if (matchedFullType) {
    if (levelId && levelId !== '0') {
      return `${matchedFullType} ${levelId}`;
    } else {
      return matchedFullType;
    }
  }

  // Default floor handling (regular numbered floors)
  if (levelType === 'F' || levelType.toLowerCase() === 'floor') {
    return levelId ? `${levelId}/F` : 'G/F';
  }

  // Fallback
  return `${levelType.replaceAll(' ', '').replaceAll('&', ' & ')}${levelId}`.trim();
}

export function normaliseFloorForDisplayZh(
  addressProperties: AddressProperties,
  locale: Locale = 'zh-hant'
): string {
  if (!addressProperties.floorNumber && !addressProperties.floorType) {
    return '';
  }

  let levelId = addressProperties.floorNumber || '';
  let levelType = addressProperties.floorType || 'F';

  // Map English floor types to Chinese equivalents
  const floorTypeMap: Record<string, string> = {
    G: floorTypeI18n.G?.[locale] || '地下',
    Ground: floorTypeI18n.G?.[locale] || '地下',
    B: floorTypeI18n.B?.[locale] || '地庫',
    Basement: floorTypeI18n.B?.[locale] || '地庫',
    M: floorTypeI18n.M?.[locale] || '夾層',
    Mezzanine: floorTypeI18n.M?.[locale] || '夾層',
    UG: floorTypeI18n.UG?.[locale] || '高層',
    'Upper Ground': floorTypeI18n.UG?.[locale] || '高層',
    LG: floorTypeI18n.LG?.[locale] || '低層',
    'Lower Ground': floorTypeI18n.LG?.[locale] || '低層',
    U: floorTypeI18n.U?.[locale] || '高層',
    Upper: floorTypeI18n.U?.[locale] || '高層',
    P: floorTypeI18n.P?.[locale] || '停車場',
    Parking: floorTypeI18n.P?.[locale] || '停車場',
    C: floorTypeI18n.C?.[locale] || '大堂',
    Concourse: floorTypeI18n.C?.[locale] || '大堂',
    L: floorTypeI18n.L?.[locale] || '樓層',
    Level: floorTypeI18n.L?.[locale] || '樓層',
    LP: floorTypeI18n.LP?.[locale] || '低層停車場',
    'Lower Parking': floorTypeI18n.LP?.[locale] || '低層停車場',
    PA: floorTypeI18n.PA?.[locale] || '茶水間',
    Pantry: floorTypeI18n.PA?.[locale] || '茶水間',
    PR: floorTypeI18n.PR?.[locale] || '停車場',
    'Parking Ramp': floorTypeI18n.PR?.[locale] || '停車場',
    R: floorTypeI18n.R?.[locale] || '天台',
    Roof: floorTypeI18n.R?.[locale] || '天台',
    T: floorTypeI18n.T?.[locale] || '平台',
    Terrace: floorTypeI18n.T?.[locale] || '平台',
    F: floorTypeI18n.F?.[locale] || '樓',
    Floor: floorTypeI18n.F?.[locale] || '樓'
  };

  // Get Chinese floor type
  const chineseFloorType =
    floorTypeMap[levelType] || floorTypeMap[levelType.toLowerCase()] || '樓';

  // Handle ground floor special case
  if (
    levelType.toUpperCase() === 'G' ||
    levelType.toLowerCase() === 'ground' ||
    (levelId === '0' && (levelType === 'F' || levelType.toLowerCase() === 'floor'))
  ) {
    return chineseFloorType; // Just "地下" for ground floor
  }

  // For regular floors, add the number before the floor type
  if (levelId && levelId !== '0') {
    return `${levelId}${chineseFloorType}`;
  } else {
    return chineseFloorType;
  }
}

// ************
// DISPLAY :: BUILDING
// ************

// COMPONENT :: buildingName,

export function normaliseBuildingNameForDisplayEn(
  addressProperties: AddressProperties
): string {
  let buildingName = addressProperties.buildingName || '';
  Object.entries(buildingAbbreviations).forEach(([full, abbrev]) => {
    // Only match at the end of the segment (after word boundary)
    const regex = new RegExp(`\\b${full}$`, 'gi');
    buildingName = buildingName.replace(regex, abbrev);
  });
  return buildingName.trim();
}

export function normaliseBuildingNameForDisplayZh(
  addressProperties: AddressProperties
): string {
  return addressProperties.buildingName || '';
}

// ************
// DISPLAY :: BLOCK
// ************

// COMPONENT :: blockType, blockNumber, blockTypeBeforeNumber, phaseNumber, phaseName, estateName

export function normaliseEstateForDisplayEn(
  addressProperties: AddressProperties
): string {
  let blockComponent = addressProperties.blockType || '';
  let blockNumber = addressProperties.blockNumber || '';
  let blockTypeBeforeNumber = addressProperties.blockTypeBeforeNumber || false;
  if (blockComponent && blockNumber) {
    if (blockTypeBeforeNumber) {
      blockComponent = `${blockComponent} ${blockNumber}`;
    } else {
      blockComponent = `${blockNumber} ${blockComponent}`;
    }
  }
  Object.entries(estateAbbreviations).forEach(([full, abbrev]) => {
    const regex = new RegExp(`\\b${full}\\b`, 'gi');
    blockComponent = blockComponent.replace(regex, abbrev);
  });
  let phaseComponent = '';
  if (addressProperties.phaseNumber) {
    phaseComponent = `Ph ${addressProperties.phaseNumber}`;
  }
  if (addressProperties.phaseName) {
    phaseComponent = `${addressProperties.phaseName} ${phaseComponent}`;
  }
  let estateComponent = addressProperties.estateName || '';
  return [blockComponent, phaseComponent, estateComponent]
    .filter(Boolean)
    .join(', ')
    .trim();
}

export function normaliseEstateForDisplayZh(
  addressProperties: AddressProperties
): string {
  let blockComponent = addressProperties.blockType || '';
  let blockNumber = addressProperties.blockNumber || '';
  let blockTypeBeforeNumber = addressProperties.blockTypeBeforeNumber || false;
  if (blockComponent && blockNumber) {
    if (blockTypeBeforeNumber) {
      blockComponent = `${blockComponent} ${blockNumber}`;
    } else {
      blockComponent = `${blockNumber} ${blockComponent}`;
    }
  }
  let phaseComponent = '';
  if (addressProperties.phaseNumber) {
    phaseComponent = `期${addressProperties.phaseNumber}期`;
  }
  if (addressProperties.phaseName) {
    phaseComponent = `${addressProperties.phaseName} ${phaseComponent}`;
  }
  let estateComponent = addressProperties.estateName || '';
  return [estateComponent, phaseComponent, blockComponent]
    .filter(Boolean)
    .join(', ')
    .trim();
}

// ************
// DISPLAY :: STREET
// ************

// COMPONENT :: buildingNumberFrom , buildingNumberTo,  streetName,

export function normaliseStreetNameForDisplayEn(
  addressProperties: AddressProperties
): string {
  const { buildingNumberFrom, buildingNumberTo, streetName } = addressProperties;

  // Start with building numbers
  let result = '';

  if (buildingNumberFrom) {
    result = buildingNumberFrom;

    if (buildingNumberTo) {
      if (buildingNumberTo.startsWith(',')) {
        // Concatenate directly if buildingNumberTo starts with comma
        result += buildingNumberTo;
      } else {
        // Join with hyphen
        result += `-${buildingNumberTo}`;
      }
    }

    // Add space before street name
    result += ' ';
  }

  result = toUpperCase(result);

  // Apply abbreviations to street name
  let normalizedStreetName = streetName || '';
  Object.entries(streetnameAbbreviations).forEach(([full, abbrev]) => {
    const regex = new RegExp(`\\b${full}\\b`, 'gi');
    normalizedStreetName = normalizedStreetName.replace(regex, abbrev);
  });

  // Append street name
  result += toTitleCase(normalizedStreetName);

  return result.trim();
}

export function normaliseStreetNameForDisplayZh(
  addressProperties: AddressProperties,
  locale: Locale
): string {
  const { buildingNumberFrom, buildingNumberTo, streetName } = addressProperties;

  // Start with street name
  let result = streetName || '';

  // If we have building numbers, append them
  if (buildingNumberFrom) {
    let numberPart = buildingNumberFrom;

    if (buildingNumberTo) {
      if (buildingNumberTo.startsWith(',')) {
        // Concatenate directly if buildingNumberTo starts with comma
        numberPart += buildingNumberTo;
      } else {
        // Join with hyphen
        numberPart += `-${buildingNumberTo}`;
      }
    }

    // Append number and the appropriate Chinese character for "number"
    const numberSuffix = locale === 'zh-hans' ? '号' : '號';
    result += numberPart + numberSuffix;
  }

  return result.trim();
}

// ************
// DISPLAY :: LOT
// ************

// COMPONENT :: lotNumber, lotType

const lotTypeAbbreviations = {
  RBL: 'rural building lot'
};

export function normaliseLotForDisplayEn(addressProperties: AddressProperties): string {
  const lotNumber = addressProperties.lotNumber || '';
  let lotType = addressProperties.lotType || '';
  Object.entries(lotTypeAbbreviations).forEach(([abbrev, full]) => {
    const regex = new RegExp(`\\b${full}\\b`, 'gi');
    lotType = lotType.replace(regex, abbrev);
  });
  return `${lotType} ${lotNumber}`.trim();
}

export function normaliseLotForDisplayZh(addressProperties: AddressProperties): string {
  const lotNumber = addressProperties.lotNumber || '';
  const lotType = addressProperties.lotType || '';
  return `${lotNumber}${lotType}`;
}

// ************
// DISPLAY :: NEIGHBOURHOOD
// ************

// COMPONENT :: neighbourhood

export function normaliseNeighbourhoodForDisplayEn(
  addressProperties: AddressProperties
): string {
  const neighbourhood = addressProperties.neighbourhood || '';
  if (neighbourhood) {
    return neighbourhood;
  } else if (addressProperties.district) {
    return getNormalisedDistrict(addressProperties.district, 'en');
  }
  return '';
}

export function normaliseNeighbourhoodForDisplayZh(
  addressProperties: AddressProperties,
  locale: Locale
): string {
  const neighbourhood = addressProperties.neighbourhood || '';
  const district = addressProperties.district || '';
  if (neighbourhood && neighbourhood !== district) {
    return `${getNormalisedDistrict(addressProperties.district, locale)}${neighbourhood}`;
  } else if (district) {
    return getNormalisedDistrict(addressProperties.district, locale);
  }
  return '';
}

// ************
// DISPLAY :: ADMINISTRATIVE DIVISION
// ************

// COMPONENT :: district, region, country

export function normaliseAdminDivisionForDisplayEn(
  addressProperties: AddressProperties
): string {
  return '';
}

export function normaliseAdminDivisionForDisplayZh(
  addressProperties: AddressProperties,
  locale: Locale
): string {
  return getNormalisedRegion(addressProperties.region, locale);
}
