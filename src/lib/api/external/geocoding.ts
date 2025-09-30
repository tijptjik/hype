// DATA
import neighbourhoods from '$lib/map/neighbourhoods.json';
import { toTitleCase } from '$lib/index';
// SERVICES
import {
  calculateDistance,
  capitalizeFirstLetter,
  getFirstLocation,
  removeRegion,
  titleCase,
  getAddressForQuery,
  convertToWebMercator,
  convertFromWebMercator,
  addDistrictForNonUniqueStreet,
  isRunningSequence as _isRunningSequence
} from '$lib/utils/geocoding';
import { parseSubPremisesComponent } from '$lib/utils/geo/parsing';
import { toLowerCase } from '../../index';
import {
  getDistrictFromNeighbourhood,
  getNormalisedDistrict,
  getNormalisedDistrictKey,
  getNormalisedRegionKey,
  getNormalisedCountryKey,
  canonicalSubNeighbourhoods,
  districtNormalised,
  nonUniqueStreetNames
} from '$lib/utils/normalisation';
import {
  normaliseAdminDivisionForDisplayEn,
  normaliseAdminDivisionForDisplayZh,
  normaliseBuildingNameForDisplayEn,
  normaliseBuildingNameForDisplayZh,
  normaliseEstateForDisplayEn,
  normaliseEstateForDisplayZh,
  normaliseFloorForDisplayEn,
  normaliseFloorForDisplayZh,
  normaliseLotForDisplayEn,
  normaliseLotForDisplayZh,
  normaliseNeighbourhoodForDisplayEn,
  normaliseNeighbourhoodForDisplayZh,
  normaliseStreetNameForDisplayEn,
  normaliseStreetNameForDisplayZh,
  normaliseUnitForDisplayEn,
  normaliseUnitForDisplayZh
} from '$lib/utils/display';
// TYPES
import type {
  AddressProperties,
  AddressMeta,
  ReverseGeocodeResult,
  ParsedGeocodeResult,
  ALSResult,
  ALSSuggestedAddressItem,
  Locale
} from '$lib/types';

/************
 * ORCHESTRATION
 ************/

/**
 * Get address information from coordinates using reverse geocoding
 *
 * Process:
 * 1. Fetch reverse geocode result from HK Map Service API
 * 2. Parse and structure the result
 * 3. Attempt to enrich with forward geocoding for better accuracy
 * 4. Merge results prioritizing reverse geocode display address
 *
 * @param lng - The longitude of the point to reverse geocode
 * @param lat - The latitude of the point to reverse geocode
 * @returns Structured address data with addressMeta and i18n sections, or null if fails
 */
export async function getAddressFromCoordinates(
  lng: number,
  lat: number
): Promise<ParsedGeocodeResult | null> {
  const result = await fetchReverseGeocodeResultFromCoordinates(lng, lat);
  if (!result) {
    console.warn('🗺️ getAddressFromCoordinates: No reverse geocode result found');
    return null;
  }
  // Parse the response into our canonical format
  const processedResult = processReverseGeocodeResult(result, lng, lat);
  if (!processedResult) {
    console.warn(
      '🗺️ getAddressFromCoordinates: Failed to process reverse geocode result'
    );
    return null;
  }

  // Attempt to enrich with forward geocoding for better accuracy
  try {
    const addressProperties = processedResult?.i18n.en.addressProperties;
    // Create fallback street address with district appended for non-unique streets
    const baseStreetAddress =
      `${addressProperties?.buildingNumberFrom} ${addressProperties?.streetName}`.trim();
    const streetAddressUniqued = addDistrictForNonUniqueStreet(
      baseStreetAddress,
      getNormalisedDistrict(addressProperties?.district, 'en'),
      'en'
    );

    const forwardResult = await fetchALSResultFromAddress(streetAddressUniqued);

    if (forwardResult) {
      const enrichedResult = await processForwardGeocodeResult(
        forwardResult,
        addressProperties?.neighbourhood,
        lng,
        lat,
        undefined,
        undefined,
        'REVERSE'
      );

      if (enrichedResult) {
        console.log(
          '🗺️ getAddressFromCoordinates: Forward geocoding enrichment successful'
        );
        // Merge results with reverse geocode taking priority for display address
        return mergeGeocodingResults(processedResult, enrichedResult);
      }
    }
  } catch (error) {
    console.error(
      '🗺️ getAddressFromCoordinates: Forward geocoding enrichment failed:',
      error
    );
  }

  console.log('🗺️ getAddressFromCoordinates: Returning reverse geocode result only');
  return processedResult;
}

/**
 * Get coordinates from an address string
 *
 * Process:
 * 1. Clean and parse the input address
 * 2. Extract neighbourhood and street address components
 * 3. Call ALS API for geocoding
 * 4. Return coordinates and basic address metadata
 *
 * @param address - The address string to geocode
 * @returns Object with addressMeta and coordinates, or null if fails
 */
export async function getCoordinatesFromAddress(
  address: string,
  locale: Locale = 'en'
): Promise<{ addressMeta: AddressMeta; coordinates: [number, number] } | null> {
  console.log(
    `🗺️ getCoordinatesFromAddress: Starting forward geocoding for "${address}"`
  );

  const { queryAddress } = getAddressForQuery(address, locale);
  console.log(
    `🗺️ getCoordinatesFromAddress: Parsed address - street: "${queryAddress}"`
  );

  try {
    const result = await fetchALSResultFromAddress(queryAddress);
    if (!result?.SuggestedAddress?.length) {
      console.warn('🗺️ getCoordinatesFromAddress: No ALS results found');
      return null;
    }

    const alsAddress = result.SuggestedAddress[0];
    const pa = alsAddress.Address.PremisesAddress;
    const coordinates: [number, number] = [
      parseFloat(pa.GeospatialInformation.Longitude),
      parseFloat(pa.GeospatialInformation.Latitude)
    ];

    const addressMeta: AddressMeta = {
      geoAddressCode: pa.GeoAddress,
      longitude: coordinates[0],
      latitude: coordinates[1],
      confidenceForwardGeocoder: alsAddress.ValidationInformation.Score,
      addressForwardGeocoder: 'hkgov_als',
      addressForwardGen: true
    };

    console.log(
      `🗺️ getCoordinatesFromAddress: Successfully geocoded to (${coordinates[0]}, ${coordinates[1]})`
    );
    return { addressMeta, coordinates };
  } catch (error) {
    console.error('🗺️ getCoordinatesFromAddress: Geocoding failed:', error);
    return null;
  }
}

/**
 * Get structured address information from an address string
 *
 * Process:
 * 1. Clean and parse the input address
 * 2. Extract neighbourhood and street address components
 * 3. Call ALS API for detailed address data
 * 4. Process and structure the response into canonical format
 * 5. Generate display addresses for all supported locales
 *
 * @param address - The address string to process
 * @returns Structured address data with addressMeta and i18n sections, or null if fails
 */
export async function getAddressFromAddress(
  address: string,
  locale: Locale = 'en'
): Promise<ParsedGeocodeResult | null> {
  console.log(`🗺️ getAddressFromAddress: Starting address processing for "${address}"`);

  const { queryAddress, streetAddress, neighbourhood, subpremisesRaw } =
    getAddressForQuery(address, locale);
  console.log(`🗺️ getAddressFromAddress: Parsed address - street: "${queryAddress}"`);

  try {
    const result = await fetchALSResultFromAddress(queryAddress);
    if (!result?.SuggestedAddress?.length) {
      console.warn('🗺️ getAddressFromAddress: No ALS results found');
      return null;
    }

    // Use placeholder coordinates for distance calculation (will be 0)
    const processedResult = await processForwardGeocodeResult(
      result,
      neighbourhood,
      0, // placeholder longitude
      0, // placeholder latitude
      subpremisesRaw,
      locale,
      address
    );

    if (processedResult) {
      console.log('🗺️ getAddressFromAddress: Successfully processed address', result);
      return processedResult;
    } else {
      console.warn('🗺️ getAddressFromAddress: Failed to process ALS result');
      return null;
    }
  } catch (error) {
    console.error('🗺️ getAddressFromAddress: Address processing failed:', error);
    return null;
  }
}

/************
 * EXTERNAL APIs
 ************/

/**
 * Fetch a reverse geocoding result from the HK Map Service API
 * @param lng - The longitude of the point to reverse geocode
 * @param lat - The latitude of the point to reverse geocode
 * @returns The reverse geocoding result, or null if the request fails
 */
async function fetchReverseGeocodeResultFromCoordinates(
  lng: number,
  lat: number
): Promise<ReverseGeocodeResult | null> {
  const endPoint = 'https://api.hkmapservice.gov.hk/ags/gc/loc/address/reverseGeocode';
  const [x, y] = convertToWebMercator(lng, lat);
  const params = new URLSearchParams({
    key: '6a40dd75bce8494ea735efd8d97dd820',
    outSR: JSON.stringify({ wkid: 3857 }),
    location: JSON.stringify({
      x,
      y,
      spatialReference: { wkid: 102100, latestWkid: 3857 }
    }),
    distance: '500',
    f: 'json'
  });

  const response = await fetch(`${endPoint}?${params}`);
  const result = await response.json();

  return result?.address ? result : null;
}

/**
 * Fetch a forward geocoding result from the Hong Kong Government Address Lookup Service API
 * @see https://www.als.gov.hk/docs/Data_Dictionary_for_ALS_EN-v3.2.pdf
 *
 * @note The 3D addresses are only provided for Public Housing Estates managed by the Housing Authority.
 *
 * @param address - The address to forward geocode
 * @param floor - The floor to lookup - only relevant for Public Housing Estates managed by the Housing Authority.
 * @param unit - The unit to lookup - only relevant for Public Housing Estates managed by the Housing Authority.
 * @param minConfidence - The minimum confidence score for the result
 * @param maxResults - The maximum number of results to return
 * @param exactMatch - ALS "Basic Searching" mode - exact match or similiar spelling and sounds match
 * @returns The forward geocoding result, or null if the request fails
 */
export async function fetchALSResultFromAddress(
  address: string,
  floor: string | null = null,
  unit: string | null = null,
  minConfidence: number = 60,
  maxResults: number = 1,
  exactMatch: boolean = false
): Promise<ALSResult> {
  const endPoint = 'https://www.als.gov.hk/lookup';
  const basicSearch = exactMatch ? 1 : 0;
  const subPremises = floor || unit ? 1 : 0; // 3D Searching - sub-premises search
  let url = `${endPoint}?q=${encodeURIComponent(address)}&t=${minConfidence}&n=${maxResults}&b=${basicSearch}&3d=${subPremises}`;
  if (floor) {
    url += `&floor=${encodeURIComponent(floor)}`;
  }
  if (unit) {
    url += `&unit=${encodeURIComponent(unit)}`;
  }
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'Accept-Language': 'en-US,en;q=0.9,zh-HK;q=0.8,zh;q=0.7,zh-hant;q=0.7'
    }
  });
  console.log(
    '🗺️ fetchALSResultFromAddress: Response:',
    JSON.stringify(response, null, 2)
  );
  const result = await response.json();
  return result;
}

/**
 * Fetch a forward geocoding result from the Hong Kong Government Address Lookup Service API
 * @see https://www.als.gov.hk/docs/Data_Dictionary_for_ALS_EN-v3.2.pdf
 *
 * @note The 3D addresses are only provided for Public Housing Estates managed by the Housing Authority.
 *
 * @param geoAddressCode - The geo address code to lookup
 * @param floor - The floor to lookup - only relevant for Public Housing Estates managed by the Housing Authority.
 * @param unit - The unit to lookup - only relevant for Public Housing Estates managed by the Housing Authority.
 * @param maxResults - The maximum number of results to return
 * @returns The geo address lookup result, or null if the request fails
 */
export async function fetchALSResultFromGeoAddress(
  geoAddressCode: string,
  floor: string | null = null,
  unit: string | null = null,
  maxResults: number = 1
): Promise<ALSResult> {
  const endPoint = 'https://www.als.gov.hk/galookup';
  const subPremises = floor || unit ? 1 : 0; // 3D Searching - sub-premises search
  let url = `${endPoint}?ga=${geoAddressCode}&n=${maxResults}&3d=${subPremises}`;
  if (floor) {
    url += `&floor=${encodeURIComponent(floor)}`;
  }
  if (unit) {
    url += `&unit=${encodeURIComponent(unit)}`;
  }
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'Accept-Language': 'en-US,en;q=0.9,zh-HK;q=0.8,zh;q=0.7,zh-hant;q=0.7'
    }
  });
  return response.json();
}

/************
 * PARSING
 ************/

/**
 * Process a reverse geocoding result
 *
 * @note This service will never return unitPortion, UnitNumber, UnitType, FloorNumber, FloorType, or BuildingName.
 *
 * @param result - The reverse geocoding result to process
 * @param lng - The longitude of the point to process
 * @param lat - The latitude of the point to process
 * @returns The processed reverse geocoding result
 */
function processReverseGeocodeResult(
  result: ReverseGeocodeResult,
  lng: number,
  lat: number
): ParsedGeocodeResult | null {
  // ADDRESSPROPERTY :: buildingNumberFrom, buildingNumberTo, streetName
  const { buildingNumberFrom, buildingNumberTo, streetName } = parseStreetAddress(
    result.address?.Street
  );

  // ADDRESSMETA :: longitude, latitude, distanceFromPoint
  const [resultLng, resultLat] = convertFromWebMercator(
    result.location.x,
    result.location.y
  );
  const distance = calculateDistance(lng, lat, resultLng, resultLat);

  // ADDRESSPROPERTY :: neighbourhood, district
  const { neighbourhood, discriminant } = parseReverseGeocodeNeighbourhood(
    result.address.Neighborhood || result.address.City || result.address.Subregion
  );
  const district = discriminant
    ? discriminant
    : neighbourhood
      ? getDistrictFromNeighbourhood(neighbourhood, 'en')
      : null;

  // CANONICAL :: ADDRESSPROPERTES
  const addressProperties = {
    formattedAddress: titleCase(result.address.Match_addr) || undefined,
    buildingNumberFrom,
    buildingNumberTo,
    streetName,
    neighbourhood: titleCase(neighbourhood) || undefined,
    district: getNormalisedDistrictKey(district) || undefined,
    region: getNormalisedRegionKey(result.address.State),
    country: getNormalisedCountryKey('Hong Kong')
  };

  // CANONICAL FORM
  const processedResult: ParsedGeocodeResult = {
    addressMeta: {
      longitude: resultLng,
      latitude: resultLat,
      distanceFromPoint: distance,
      addressReverseGeocoder: 'hkgov_reverse',
      addressReverseGen: true
    },
    i18n: {
      en: {
        displayAddress: generateDisplayAddress(addressProperties, 'en'),
        displayAddressGen: true,
        addressProperties
      },
      'zh-hant': {
        displayAddress: undefined,
        displayAddressGen: true,
        addressProperties: {}
      },
      'zh-hans': {
        displayAddress: undefined,
        displayAddressGen: true,
        addressProperties: {}
      }
    }
  };

  return processedResult;
}

// TODO
// The API results is sometimes overeager with providing results, so we should have a safety mechanism that the data that's provide by the user, or the data we already have, isn't overridden by a guess by the API -- so when we are resolving data -- we should check to see what the MOST specific level is thaT WE ourselves provided, and only accept MORE specific information from the API If we DONT have more specific data already.

// e.g. if a street address is provided '3 Harbour Road' then it's fine to accept blocks / phases and building names if we DONT have any of that data already --

// Display: Shop 8, 2/F, Island Crest, 8 First Street, Sai Ying Pun, Hong Kong

// en: Shop 8, Floor 2, Twr 1, Island Crest, 8 First St, Sai Ying Pun

/**
 * Process a forward geocoding result from the Hong Kong Government Address Lookup Service API
 *
 * @param result - The forward geocoding result to process
 * @param neighbourhood - The neighbourhood to process
 * @param lng - The longitude of the point to process
 * @param lat - The latitude of the point to process
 * @returns The processed forward geocoding result
 */
export async function processForwardGeocodeResult(
  result: ALSResult,
  neighbourhoodRef: string | null | undefined,
  lng: number,
  lat: number,
  subPremisesRaw: string | null | undefined,
  subPremisesLocale: Locale = 'en',
  rawAddress: string | null | undefined
): Promise<ParsedGeocodeResult | null> {
  if (!result.SuggestedAddress?.length) return null;

  // ALS ADDRESS
  const alsAddress = result.SuggestedAddress[0].Address;
  const pa = alsAddress.PremisesAddress;
  const confidence = result.SuggestedAddress[0].ValidationInformation.Score;

  // CANONICAL ADDRESS
  const canonicalAddressEn = parseALSResultToAddressEn(
    alsAddress,
    neighbourhoodRef,
    subPremisesRaw,
    subPremisesLocale,
    rawAddress
  );
  const canonicalAddressZhHant = parseALSResultToAddressZhHant(
    alsAddress,
    neighbourhoodRef,
    subPremisesRaw,
    subPremisesLocale,
    rawAddress
  );
  const canonicalAddressZhHans = canonicalAddressZhHant
    ? await translateAddressZhHantToZhHans(
        canonicalAddressZhHant,
        subPremisesRaw,
        subPremisesLocale
      )
    : null;

  return {
    addressMeta: getAddressMeta(pa, lng, lat, confidence),
    i18n: {
      en: canonicalAddressEn,
      'zh-hant': canonicalAddressZhHant,
      'zh-hans': canonicalAddressZhHans!
    }
  };
}

function generateDisplayAddress(
  addressProperties: AddressProperties,
  locale: SupportedLocales = 'en'
) {
  if (locale === 'en') {
    return generateDisplayAddressEn(addressProperties);
  } else if (locale === 'zh-hant' || locale === 'zh-hans') {
    return generateDisplayAddressZh(addressProperties, locale);
  } else {
    return null;
  }
}

function generateDisplayAddressEn(addressProperties: AddressProperties) {
  // COMPONENT :: unitPortion, unitNumber, unitType
  let unitComponent = normaliseUnitForDisplayEn(addressProperties);

  // COMPONENT :: floorNumber, floorType,
  let floorComponent = normaliseFloorForDisplayEn(addressProperties);

  // TODO reintrgrate and add premisesName
  // COMPONENT :: buildingName, premisesName
  // let buildingComponent = normaliseBuildingNameForDisplayEn(addressProperties);

  // COMPONENT :: blockType, blockNumber, blockTypeBeforeNumber, phaseNumber, phaseName, estateName,
  let estateComponent = normaliseEstateForDisplayEn(addressProperties);

  // COMPONENT :: streetName,  buildingNumberFrom , buildingNumberTo,
  let streetComponent = normaliseStreetNameForDisplayEn(addressProperties);

  // COMPONENT :: lotNumber, lotType,
  let lotComponent = normaliseLotForDisplayEn(addressProperties);

  // COMPONENT :: neighbourhood,
  let neighbourhoodComponent = normaliseNeighbourhoodForDisplayEn(addressProperties);

  // COMPONENT :: district, region, country
  let adminDivisionComponent = normaliseAdminDivisionForDisplayEn(addressProperties);

  // Join all components with a comma
  return [
    unitComponent,
    floorComponent,
    // buildingComponent,
    estateComponent,
    streetComponent,
    lotComponent,
    neighbourhoodComponent,
    adminDivisionComponent
  ]
    .filter(Boolean)
    .join(', ');
}

function generateDisplayAddressZh(
  addressProperties: AddressProperties,
  locale: Locale
) {
  // COMPONENT :: unitPortion, unitNumber, unitType
  let unitComponent = normaliseUnitForDisplayZh(addressProperties);

  // COMPONENT :: floorNumber, floorType,
  let floorComponent = normaliseFloorForDisplayZh(addressProperties);

  // COMPONENT :: buildingName,
  let buildingComponent = normaliseBuildingNameForDisplayZh(addressProperties);

  // COMPONENT :: blockType, blockNumber, blockTypeBeforeNumber, phaseNumber, phaseName, estateName,
  let estateComponent = normaliseEstateForDisplayZh(addressProperties);

  // COMPONENT :: streetName,
  let streetComponent = normaliseStreetNameForDisplayZh(addressProperties, locale);

  // COMPONENT :: lotNumber, lotType,
  let lotComponent = normaliseLotForDisplayZh(addressProperties);

  // COMPONENT :: neighbourhood,
  let neighbourhoodComponent = normaliseNeighbourhoodForDisplayZh(
    addressProperties,
    locale
  );

  // COMPONENT :: district, region, country
  let adminDivisionComponent = normaliseAdminDivisionForDisplayZh(
    addressProperties,
    locale
  );

  // Join all components with a comma
  return [
    adminDivisionComponent,
    neighbourhoodComponent,
    lotComponent,
    streetComponent,
    estateComponent,
    buildingComponent,
    floorComponent,
    unitComponent
  ]
    .filter(Boolean)
    .join('');
}

function generateDisplayAddressZhHant(addressProperties: AddressProperties) {
  return parseALSResultToDisplay(address, neighbourhood, 'zh-hant');
}

// TODO Include Subpremise information in the display address
// function parseALSResultToDisplay(
//   address: ALSSuggestedAddressItem,
//   neighbourhood: string | null,
//   locale: Exclude<Locale, 'zh-hans'> = 'en'
// ) {
//   const pa = address.Address.PremisesAddress;

//   if (locale === 'en') {
//     const { EngPremisesAddress: eng } = pa;
//     const parts = [];

//     // Building/Block info
//     if (eng.BuildingName) {
//       parts.push(eng.BuildingName);
//     }
//     if (eng.EngBlock) {
//       const blockPart =
//         eng.EngBlock.BlockDescriptorPrecedenceIndicator === 'Y'
//           ? `${eng.EngBlock.BlockDescriptor} ${eng.EngBlock.BlockNo}`
//           : `${eng.EngBlock.BlockNo} ${eng.EngBlock.BlockDescriptor}`;
//       parts.push(blockPart);
//     }

//     // Estate/Phase info
//     if (eng.EngEstate) {
//       let estatePart = eng.EngEstate.EstateName;
//       if (eng.EngEstate.EngPhase?.PhaseNo) {
//         estatePart = `${estatePart} PH ${eng.EngEstate.EngPhase.PhaseNo}`;
//       }
//       parts.push(estatePart);
//     }

//     // Street address
//     if (eng.EngStreet) {
//       let streetAddress = '';
//       if (eng.EngStreet.BuildingNoFrom) {
//         streetAddress = eng.EngStreet.BuildingNoFrom;
//       }
//       if (eng.EngStreet.BuildingNoTo) {
//         streetAddress = `${streetAddress}-${eng.EngStreet.BuildingNoTo}`;
//       }
//       streetAddress = `${streetAddress} ${eng.EngStreet.StreetName}`;
//       parts.push(streetAddress);
//     }

//     // Area info
//     if (neighbourhood) {
//       parts.push(neighbourhood);
//     } else {
//       const location =
//         eng.EngStreet?.EngVillage?.LocationName ||
//         getNormalisedDistrict(eng.EngDistrict.DcDistrict, 'en');
//       if (location) {
//         parts.push(location);
//       }
//     }

//     return removeRegion(titleCase(applyAddressAbbreviations(parts.join(', '))));
//   } else {
//     if (!('ChiPremisesAddress' in pa)) return null;
//     const { ChiPremisesAddress: chi } = pa;
//     const parts = [];

//     // Area info
//     const location = chi.ChiDistrict.DcDistrict;
//     if (location) {
//       parts.push(location);
//     }

//     // Street address
//     if (chi.ChiStreet) {
//       parts.push(chi.ChiStreet.StreetName);
//       if (chi.ChiStreet.BuildingNoFrom) {
//         let numberRange = chi.ChiStreet.BuildingNoFrom;
//         if (chi.ChiStreet.BuildingNoTo) {
//           numberRange = `${chi.ChiStreet.BuildingNoFrom}-${chi.ChiStreet.BuildingNoTo}`;
//         }
//         parts.push(numberRange + '號');
//       }
//     }

//     // Estate/Phase info
//     if (chi.ChiEstate) {
//       let estatePart = chi.ChiEstate.EstateName;
//       if (chi.ChiEstate.ChiPhase?.PhaseNo) {
//         estatePart = `${estatePart}第${chi.ChiEstate.ChiPhase.PhaseNo}期`;
//       }
//       parts.push(estatePart);
//     }

//     // Building/Block info
//     if (chi.BuildingName) {
//       parts.push(chi.BuildingName);
//     }
//     if (chi.ChiBlock) {
//       parts.push(`${chi.ChiBlock.BlockNo}${chi.ChiBlock.BlockDescriptor}`);
//     }

//     // Skip adding region to avoid regional suffixes
//     // parts.push(chi.Region);

//     return parts.join('');
//   }
// }

/************
 * UTILITY FUNCTIONS
 ************/

/**
 * Merge geocoding results from reverse and forward geocoding
 *
 * Strategy:
 * - Prioritize reverse geocode display address (cleaner)
 * - Use forward geocode for detailed address properties
 * - Merge address metadata keeping both sources
 * - Preserve all i18n data from forward geocoding
 *
 * @param reverseResult - Result from reverse geocoding
 * @param forwardResult - Result from forward geocoding (enrichment)
 * @returns Merged result with best data from both sources
 */
function mergeGeocodingResults(
  reverseResult: ParsedGeocodeResult,
  forwardResult: ParsedGeocodeResult
): ParsedGeocodeResult {
  console.log(
    '🗺️ mergeGeocodingResults: Merging reverse and forward geocoding results'
  );

  const mergedResult: ParsedGeocodeResult = {
    // Merge address metadata, keeping both sources
    ...forwardResult,
    addressMeta: {
      ...forwardResult.addressMeta,
      distanceFromPoint: reverseResult.addressMeta.distanceFromPoint,
      addressReverseGeocoder: reverseResult.addressMeta.addressReverseGeocoder,
      addressReverseGen: reverseResult.addressMeta.addressReverseGen
    }
  };

  console.log('🗺️ mergeGeocodingResults: Successfully merged results');
  return mergedResult;
}

/************
 * PARSING UTILS
 ************/

/**
 * Parse a street address into building number components and street name
 *
 * This function handles both English and Chinese address formats:
 *
 * English Processing:
 * - Extracts numbers from first part (supports ranges like "45-47")
 * - Applies abbreviations to street name (Road → Rd, etc.)
 * - Capitalizes street name using title case
 *
 * Chinese Processing:
 * - Extracts Chinese and Arabic numerals including suffixes (45號, 12A, 23-25)
 * - Handles hyphenated ranges for building number spans
 * - Preserves Chinese street names without modification
 *
 * @param streetAddress - The street address string to parse
 * @param locale - The locale to determine parsing strategy ('en' or Chinese variants)
 * @returns Object with buildingNumberFrom, buildingNumberTo, and streetName
 */
export function parseStreetAddress(streetAddress: string, locale: Locale = 'en') {
  console.log(
    `🗺️ parseStreetAddress: Parsing "${streetAddress}" with locale "${locale}"`
  );

  if (locale === 'en') {
    return _parseStreetAddressEn(streetAddress);
  } else {
    return _parseStreetAddressZh(streetAddress);
  }
}

/**
 * Parse an English street address into building numbers and street name
 *
 * Process:
 * 1. Split address by spaces
 * 2. Extract building numbers from first part (handles ranges with - or /)
 * 3. Apply standard abbreviations to remaining parts for street name
 * 4. Capitalize street name using title case
 *
 * Examples:
 * - "45-47 Queen's Road West" → from: "45", to: "47", street: "Queen's Rd West"
 * - "123 Nathan Road" → from: "123", to: undefined, street: "Nathan Rd"
 *
 * @param streetAddress - The English street address to parse
 * @returns Object with buildingNumberFrom, buildingNumberTo, and streetName
 */
function _parseStreetAddressEn(streetAddress: string) {
  console.log(`🗺️ _parseStreetAddressEn: Processing "${streetAddress}"`);

  let buildingNumberFrom: string | undefined;
  let buildingNumberTo: string | undefined;
  let streetName: string | undefined;

  // Find where the street name starts by looking for the first word that doesn't match number patterns
  const streetParts = streetAddress.split(' ');
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

  if (streetStartIndex > 0) {
    // Extract the full number segment (all parts before street name)
    const numberSegment = streetParts.slice(0, streetStartIndex).join(' ');
    const numberRegex = /^[\d\s,\-–&\/a-zA-Z]+$/;

    if (numberRegex.test(numberSegment)) {
      // Parse the number segment to extract individual numbers with letters
      const numberMatches = numberSegment.match(/\d+[a-zA-Z]?/g) || [];

      if (numberMatches.length > 0) {
        // Check if this is a running sequence or range
        const isRunningSequence = _isRunningSequence(numberMatches, numberSegment);

        if (isRunningSequence.isRange) {
          // It's a running sequence, store start and end
          buildingNumberFrom = isRunningSequence.from;
          buildingNumberTo = isRunningSequence.to;
        } else {
          // Not a running sequence, store first number and concatenate the rest with leading comma
          buildingNumberFrom = numberMatches[0];
          if (numberMatches.length > 1) {
            buildingNumberTo = ', ' + numberMatches.slice(1).join(', ');
          }
        }
      }
    }

    // Process street name: apply abbreviations and title case
    if (streetStartIndex < streetParts.length) {
      streetName = toTitleCase(streetParts.slice(streetStartIndex).join(' '));
    }
  } else {
    // No numbers found, treat entire string as street name
    streetName = toTitleCase(streetAddress);
  }

  console.log(
    `🗺️ _parseStreetAddressEn: Extracted - from: "${buildingNumberFrom}", to: "${buildingNumberTo}", street: "${streetName}"`
  );

  return { buildingNumberFrom, buildingNumberTo, streetName };
}

/**
 * Parse a Chinese street address into building numbers and street name
 *
 * Process:
 * 1. Use regex to extract numbers (Arabic + Chinese numerals) with optional suffixes
 * 2. Handle hyphenated ranges (23-25號) splitting into from/to components
 * 3. Extract remaining Chinese characters as street name (no modification)
 * 4. Remove extracted numbers from original string to get clean street name
 *
 * Examples:
 * - "德輔道中45號" → from: "45", to: undefined, street: "德輔道中"
 * - "23-25號皇后大道西" → from: "23", to: "25", street: "皇后大道西"
 * - "12A彌敦道" → from: "12A", to: undefined, street: "彌敦道"
 *
 * @param streetAddress - The Chinese street address to parse
 * @returns Object with buildingNumberFrom, buildingNumberTo, and streetName
 */
function _parseStreetAddressZh(streetAddress: string) {
  console.log(`🗺️ _parseStreetAddressZh: Processing "${streetAddress}"`);

  let buildingNumberFrom: string | undefined;
  let buildingNumberTo: string | undefined;
  let streetName: string | undefined;

  // Extract numbers (Arabic numerals, Chinese numerals, with optional suffixes like 號, A, B)
  // Pattern matches: 45, 12A, 23-25, 四十五號, etc.
  const numberPattern = /([0-9]+[A-Za-z]*(?:號)?(?:-[0-9]+[A-Za-z]*(?:號)?)*)/;
  const numberMatch = streetAddress.match(numberPattern);

  if (numberMatch) {
    const numberPart = numberMatch[1];
    console.log(`🗺️ _parseStreetAddressZh: Found number part: "${numberPart}"`);

    // Remove 號 suffix if present and handle ranges
    const cleanNumber = numberPart.replace(/號/g, '');

    if (cleanNumber.includes('-')) {
      // Handle ranges like "23-25"
      const parts = cleanNumber.split('-');
      buildingNumberFrom = parts[0];
      buildingNumberTo = parts[1];
    } else {
      buildingNumberFrom = cleanNumber;
    }

    // Extract street name: remove the number part and keep only Chinese characters
    streetName = streetAddress.replace(numberMatch[0], '').trim();

    // If street name starts with Chinese characters, that's our street name
    const chineseOnlyPattern = /^[\u4e00-\u9fff]+/;
    const chineseMatch = streetName.match(chineseOnlyPattern);
    if (chineseMatch) {
      streetName = chineseMatch[0];
    }

    console.log(
      `🗺️ _parseStreetAddressZh: Extracted - from: "${buildingNumberFrom}", to: "${buildingNumberTo}", street: "${streetName}"`
    );
  } else {
    // No numbers found, treat entire string as street name
    streetName = streetAddress;
    console.log(
      `🗺️ _parseStreetAddressZh: No numbers found, using full string as street: "${streetName}"`
    );
  }

  return { buildingNumberFrom, buildingNumberTo, streetName };
}

/**
 * Parse a reverse geocoding neighbourhood into a neighbourhood and discriminant
 *
 * Processing Effects:
 * - Neighbourhood will be normalized to the smallest neighbourhood name that matches the input
 * - Discriminant added to assist in disambiguating neighbourhoods with the same name, e.g. Ping Shan in Kwun Tong vs Yuen Long
 *
 * @param neighbourhoodRaw - The neighbourhood to parse
 * @returns The neighbourhood and discriminant
 */
function parseReverseGeocodeNeighbourhood(neighbourhoodRaw: string | null): {
  neighbourhood: string | null;
  discriminant: string | null;
} {
  // Priorise the smallest neighbourhood name that matches the input.
  // Examples:
  //    "Ping Shan, Yuen Long" -> "Ping Shan"
  //    "Tai Wai, Sha Tin" -> "Tai Wai"
  //    "Clear Water Bay, Sai Kung" -> "Clear Water Bay"
  //    "Central District" -> "Central"
  //    "Prince Edward" -> "Prince Edward"
  //    "Sai Wan Ho" -> "Sai Wan Ho"
  if (!neighbourhoodRaw) return { neighbourhood: null, discriminant: null };

  // Split by comma and try each option until a match is found
  const units = neighbourhoodRaw
    .split(',')
    .map((unit) => unit.toLowerCase().replace('district', '').trim());

  for (const unit of units) {
    // First try to find exact matches (prioritize full matches over partial ones)
    let neighbourhoodMatch = canonicalSubNeighbourhoods.find(
      (n) => n.toLowerCase() === unit
    );

    // If no exact match, fall back to partial matches
    if (!neighbourhoodMatch) {
      neighbourhoodMatch = canonicalSubNeighbourhoods.find((n) =>
        unit.includes(n.toLowerCase())
      );
    }

    if (neighbourhoodMatch) {
      const remainder = neighbourhoodRaw
        .replace(neighbourhoodMatch, '')
        .replace(',', '')
        .trim();
      return {
        neighbourhood: neighbourhoodMatch,
        discriminant: districtNormalised[remainder] || remainder
      };
    }
  }

  return {
    neighbourhood: null,
    discriminant: null
  };
}

function parseALSResultToAddressEn(
  alsAddress: ALSResult.SuggestedAddress.Address,
  neighbourhood: string | null | undefined,
  subPremises: string | null | undefined,
  subPremisesLocale: Locale = 'en',
  rawAddress: string | null | undefined
) {
  const pa = alsAddress.PremisesAddress;
  const addressEn = pa.EngPremisesAddress;
  let parsedSubPremises: SubpremiseComponents | null = {};

  if (subPremises) {
    parsedSubPremises = parseSubPremisesComponent(subPremises, subPremisesLocale, 'en');
    console.log('🗺️ parseALSResultToAddressEn: Parsed subPremises:', parsedSubPremises);
  }

  const addressPropertiesEn: AddressProperties = {
    ...parsedSubPremises,
    buildingName: titleCase(addressEn.BuildingName),
    buildingNumberFrom: addressEn.EngStreet.BuildingNoFrom,
    buildingNumberTo: addressEn.EngStreet.BuildingNoTo,
    blockType: titleCase(addressEn?.EngBlock?.BlockDescriptor),
    blockNumber: addressEn?.EngBlock?.BlockNo,
    blockTypeBeforeNumber:
      'EngBlock' in addressEn
        ? addressEn?.EngBlock?.BlockDescriptorPrecedenceIndicator === 'Y'
        : undefined,
    phaseName: addressEn?.EngEstate?.EngPhase?.PhaseName
      ? titleCase(addressEn.EngEstate.EngPhase.PhaseName)
      : undefined,
    phaseNumber: addressEn?.EngEstate?.EngPhase?.PhaseNo,
    estateName: titleCase(addressEn?.EngEstate?.EstateName),
    streetName: titleCase(addressEn?.EngStreet?.StreetName),
    neighbourhood: neighbourhood
      ? neighbourhood
      : addressEn?.EngStreet?.EngVillage?.LocationName
        ? getFirstLocation(addressEn?.EngStreet?.EngVillage?.LocationName)
        : undefined,
    district: getNormalisedDistrictKey(addressEn?.EngDistrict?.DcDistrict),
    region: getNormalisedRegionKey(addressEn?.Region),
    country: getNormalisedCountryKey('Hong Kong'),
    rawAddress: rawAddress
  };

  return {
    displayAddress: generateDisplayAddress(addressPropertiesEn, 'en'),
    displayAddressGen: true,
    addressProperties: Object.fromEntries(
      Object.entries(addressPropertiesEn).filter(([_, value]) => value !== undefined)
    )
  };
}

function parseALSResultToAddressZhHant(
  alsAddress: ALSResult.SuggestedAddress.Address,
  neighbourhoodRef: string | null | undefined,
  subPremises: string | null | undefined,
  subPremisesLocale: Locale = 'en',
  rawAddress: string | null | undefined
) {
  const pa = alsAddress.PremisesAddress;
  const addressZh = pa.ChiPremisesAddress;
  if (!addressZh) return null;
  let parsedSubPremises: SubpremiseComponents | null = {};

  if (subPremises) {
    parsedSubPremises = parseSubPremisesComponent(
      subPremises,
      subPremisesLocale,
      'zh-hant'
    );
    console.log(
      '🗺️ parseALSResultToAddressZhHant: Parsed subPremises:',
      parsedSubPremises
    );
  }

  let addressPropsZhHant: AddressProperties = {
    ...parsedSubPremises,
    buildingName: addressZh.BuildingName || undefined,
    buildingNumberFrom: addressZh.ChiStreet?.BuildingNoFrom || undefined,
    buildingNumberTo: addressZh.ChiStreet?.BuildingNoTo || undefined,
    blockType: addressZh.ChiBlock?.BlockDescriptor || undefined,
    blockNumber: addressZh.ChiBlock?.BlockNo || undefined,
    estateName: addressZh.ChiEstate?.EstateName || undefined,
    streetName: addressZh.ChiStreet?.StreetName || undefined,
    neighbourhood:
      _parseALSResultToNeighbourhoodZhHant(neighbourhoodRef, pa) || undefined,
    district: getNormalisedDistrictKey(addressZh.ChiDistrict?.DcDistrict),
    region: getNormalisedRegionKey(addressZh?.Region),
    country: getNormalisedCountryKey('Hong Kong'),
    rawAddress: rawAddress
  };

  return {
    displayAddress: generateDisplayAddress(addressPropsZhHant, 'zh-hant'),
    displayAddressGen: true,
    addressProperties: Object.fromEntries(
      Object.entries(addressPropsZhHant).filter(([_, value]) => value !== undefined)
    )
  };
}

function _parseALSResultToNeighbourhoodZhHant(
  neighbourhoodRef: string | null,
  pa: ALSResult.SuggestedAddress.Address.PremisesAddress
) {
  console.log(
    '🗺️ _parseALSResultToNeighbourhoodZhHant: neighbourhoodRef:',
    neighbourhoodRef,
    neighbourhoods[neighbourhoodRef as keyof typeof neighbourhoods]
  );
  console.log('🗺️ _parseALSResultToNeighbourhoodZhHant: pa:', pa);
  let neighbourhoodZhHant =
    neighbourhoods[neighbourhoodRef as keyof typeof neighbourhoods]?.i18n['zh-hant']
      ?.name || null;
  // Attempt with a disambiguated key (district code)
  if (!neighbourhoodZhHant) {
    const compositeKey = `${neighbourhoodRef}, ${getNormalisedDistrictKey(
      pa.EngPremisesAddress?.EngDistrict?.DcDistrict,
      'en'
    )}`;
    neighbourhoodZhHant =
      neighbourhoods[compositeKey as keyof typeof neighbourhoods]?.i18n['zh-hant']
        ?.name || null;
  }
  console.log(
    '🗺️ _parseALSResultToNeighbourhoodZhHant: neighbourhoodRef:',
    neighbourhoodZhHant
  );
  return neighbourhoodZhHant;
}

function getAddressMeta(
  pa: ALSResult.SuggestedAddress.Address.PremisesAddress,
  lng: number,
  lat: number,
  confidence: number
): AddressMeta {
  return Object.fromEntries(
    Object.entries({
      geoAddressCode: pa.GeoAddress,
      distanceFromPoint: calculateDistance(
        lng,
        lat,
        parseFloat(pa.GeospatialInformation.Longitude),
        parseFloat(pa.GeospatialInformation.Latitude)
      ),
      longitude: parseFloat(pa.GeospatialInformation.Longitude),
      latitude: parseFloat(pa.GeospatialInformation.Latitude),
      confidenceForwardGeocoder: confidence,
      addressForwardGeocoder: 'hkgov_als',
      addressForwardGen: true
    }).filter(([_, value]) => value !== undefined)
  );
}

/**
 * Translate Traditional Chinese address data to Simplified Chinese
 *
 * Process:
 * 1. Extract translatable properties (exclude country, region, district)
 * 2. Use canonical references for geographic terms instead of translation
 * 3. Translate remaining address components via API
 * 4. Reassemble address properties with canonical geographic terms
 *
 * Strategy:
 * - Country, region, district: Use canonical mappings from utils/geocoding.ts
 * - Building names, street names, etc.: Translate via API
 * - Display address: Translate as complete string
 *
 * @param canonicalAddressZhHant - Traditional Chinese address data to translate
 * @returns Simplified Chinese address data or null if translation fails
 */
async function translateAddressZhHantToZhHans(
  canonicalAddressZhHant: any,
  subPremisesRaw: string | null | undefined,
  subPremisesLocale: Locale = 'en'
) {
  if (!canonicalAddressZhHant) {
    console.warn(
      '🗺️ translateAddressZhHantToZhHans: No Traditional Chinese data provided'
    );
    return null;
  }

  const addressPropsZhHant = canonicalAddressZhHant.addressProperties;
  let addressPropsZhHans: Partial<AddressProperties> = {};
  let displayAddressZhHans: string | undefined;

  const parsedSubPremises = parseSubPremisesComponent(
    subPremisesRaw,
    subPremisesLocale,
    'zh-hant'
  );

  try {
    // Step 1: Separate translatable vs canonical properties
    const translatableProperties: Record<string, string> = {};
    const canonicalProperties: Record<string, string> = {};

    // Properties that should use canonical mappings (not translation)
    const canonicalKeys = [
      'country',
      'region',
      'district'
    ];

    const subPremisesKeys = [
      'unitType',
      'unitNumber',
      'unitPortion',
      'floorType',
      'floorNumber'
    ];

    Object.entries(addressPropsZhHant).forEach(([key, value]) => {
      if (value && typeof value === 'string') {
        if (canonicalKeys.includes(key)) {
          // Use canonical mapping for geographic terms
          canonicalProperties[key] = value;
        } else if (subPremisesKeys.includes(key)) {
          canonicalProperties[key] = value;
        } else {
          // Mark for translation
          translatableProperties[key] = value;
        }
      }
    });

    console.log(
      '🗺️ translateAddressZhHantToZhHans: Using canonical mappings for geographic terms:',
      canonicalProperties
    );
    console.log(
      '🗺️ translateAddressZhHantToZhHans: Translating properties:',
      Object.keys(translatableProperties)
    );

    // Step 2: Translate non-canonical properties
    if (
      Object.keys(translatableProperties).length > 0 ||
      canonicalAddressZhHant.displayAddress
    ) {
      const textsToTranslate = [
        canonicalAddressZhHant.displayAddress,
        ...Object.values(translatableProperties)
      ].filter(Boolean);

      if (textsToTranslate.length > 0) {
        const response = await fetch('/api/translation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'zh-hant',
            target: 'zh-hans',
            texts: textsToTranslate
          })
        });

        if (!response.ok) {
          throw new Error(`Translation API failed: ${response.statusText}`);
        }

        const translationResults = await response.json();

        // Extract display address translation
        if (canonicalAddressZhHant.displayAddress) {
          displayAddressZhHans = translationResults[0];
        }

        // Map translated properties back to their keys
        let propIndex = canonicalAddressZhHant.displayAddress ? 1 : 0;
        Object.entries(translatableProperties).forEach(([key, _]) => {
          addressPropsZhHans[key as keyof AddressProperties] =
            translationResults[propIndex++];
        });

        console.log('🗺️ translateAddressZhHantToZhHans: Translation API successful');
      }
    }

    // Step 3: Combine canonical and translated properties
    const finalAddressProps = {
      ...parsedSubPremises,
      ...addressPropsZhHans,
      ...canonicalProperties
    };

    const result = {
      displayAddress: displayAddressZhHans,
      displayAddressGen: canonicalAddressZhHant.displayAddressGen,
      addressProperties: Object.fromEntries(
        Object.entries(finalAddressProps).filter(([_, value]) => value !== undefined)
      )
    };

    console.log(
      '🗺️ translateAddressZhHantToZhHans: Translation completed successfully'
    );
    return result;
  } catch (error) {
    console.error('🗺️ translateAddressZhHantToZhHans: Translation failed:', error);
    return null;
  }
}
