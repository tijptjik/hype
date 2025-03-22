// SERVICES
import {
  calculateDistance,
  capitalizeFirstLetter,
  getFirstLocation,
  getNormalisedDistrict,
  getNormalisedRegion,
  removeRegion,
  titleCase
} from '$lib/utils/geocoding';
// DATA
import neighbourhoods from '$lib/map/neighbourhoods.json';
// TYPES
import type { AddressProperties, AddressMeta } from '$lib/types';

// IDENTIFY RESULT
interface ParsedReverseGeocodeResult {
  displayAddress: string | undefined;
  displayAddressGen: boolean;
  addressProperties: AddressProperties;
  addressMeta: AddressMeta;
  translations: {
    'zh-hant': {
      displayAddress: string | undefined;
      displayAddressGen: boolean;
      addressProperties: Partial<AddressProperties>;
    };
    'zh-hans': {
      displayAddress: string | undefined;
      displayAddressGen: boolean;
      addressProperties: Partial<AddressProperties>;
    };
  };
}

interface ReverseGeocodeResult {
  address: {
    Street: string;
    Neighborhood: string | null;
    City: string;
    Subregion: string | null;
    State: string;
    Country: string | null;
    Match_addr: string;
    Loc_name: string;
  };
  location: {
    x: number;
    y: number;
    spatialReference: {
      wkid: number;
      latestWkid: number;
    };
  };
}

// ALS RESULT
// Data Dictionary is available at:
// https://www.als.gov.hk/docs/Data_Dictionary_for_ALS_EN-v3.2.pdf
interface ALSResult {
  // Input address information provided in the search request
  RequestAddress: {
    AddressLine: string[];
  };
  // List of suggested addresses that match the search criteria
  SuggestedAddress?: Array<{
    Address: {
      PremisesAddress: {
        // English address components
        EngPremisesAddress: {
          // Building/Block information
          EngBlock: {
            BlockDescriptor: string; // Block type (e.g., "BLK", "TOWER")
            BlockNo: string; // Block number
            BlockDescriptorPrecedenceIndicator: string; // Whether BlockDescriptor appears before BlockNo
          };
          BuildingName: string; // English name of the building
          // Estate information
          EngEstate: {
            EstateName: string; // English name of the estate
            EngPhase?: {
              // Optional phase information
              PhaseName?: string;
              PhaseNo?: string;
            };
          };
          // Street information
          EngStreet: {
            StreetName: string; // English street name
            BuildingNoFrom: string; // Starting street number
            BuildingNoTo?: string; // Optional ending street number
            EngVillage?: {
              LocationName: string;
            };
          };
          // District information
          EngDistrict: {
            DcDistrict: string; // English district name
          };
          Region: string; // Region code (HK/KLN/NT)
        };
        // Chinese address components
        ChiPremisesAddress: {
          // Building/Block information
          ChiBlock: {
            BlockDescriptor: string; // Block type in Chinese (e.g., "座", "樓")
            BlockNo: string; // Block number
            BlockDescriptorPrecedenceIndicator?: string;
          };
          BuildingName: string; // Chinese name of the building
          // Estate information
          ChiEstate: {
            EstateName: string; // Chinese name of the estate
            ChiPhase?: {
              // Optional phase information
              PhaseName?: string;
              PhaseNo?: string;
            };
          };
          // Street information
          ChiStreet: {
            StreetName: string; // Chinese street name
            BuildingNoFrom: string; // Starting street number
            BuildingNoTo?: string; // Optional ending street number
          };
          // District information
          ChiDistrict: {
            DcDistrict: string; // Chinese district name
          };
          Region: string; // Region in Chinese (香港/九龍/新界)
        };
        // Unique identifier for the address
        GeoAddress: string; // Unique address reference number
        // Spatial coordinates
        GeospatialInformation: {
          Northing: string; // HK1980 Grid Northing
          Easting: string; // HK1980 Grid Easting
          Latitude: string; // WGS84 latitude
          Longitude: string; // WGS84 longitude
        };
      };
    };
    // Address matching confidence
    ValidationInformation: {
      Score: number; // Confidence score (0-100)
    };
  }>;
}

// First, let's add a helper function to convert WGS84 to Web Mercator (EPSG:3857)
function convertToWebMercator(lng: number, lat: number): [number, number] {
  const x = (lng * 20037508.34) / 180;
  const y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  return [x, (y * 20037508.34) / 180];
}

// And a function to convert Web Mercator back to WGS84
function convertFromWebMercator(x: number, y: number): [number, number] {
  const lng = (x * 180) / 20037508.34;
  const lat = (Math.atan(Math.exp((y * Math.PI) / 20037508.34)) * 360) / Math.PI - 90;
  return [lng, lat];
}

async function fetchReverseGeocodeResult(
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

function getDistrictFromNeighbourhood(neighbourhoodRef: string | null): string | null {
  if (!neighbourhoodRef) return null;
  const neighbourhoodNames = Object.keys(neighbourhoods);
  const neighbourhood = neighbourhoodNames.find(
    (n) => n.toLowerCase() === neighbourhoodRef.toLowerCase()
  );
  return neighbourhood
    ? neighbourhoods[neighbourhood as keyof typeof neighbourhoods].district
    : null;
}

function processReverseGeocodeResult(
  result: ReverseGeocodeResult,
  lng: number,
  lat: number
): ParsedReverseGeocodeResult | null {
  // Parse street address
  const streetParts = result.address?.Street?.split(' ') || [];
  let buildingNumberFrom: string | undefined;
  let buildingNumberTo: string | undefined;
  let streetName: string | undefined;

  if (streetParts.length > 1) {
    const numbers = streetParts[0].split(/[-\/]/);
    buildingNumberFrom = numbers[0];
    buildingNumberTo = numbers[1];
    streetName = capitalizeFirstLetter(streetParts.slice(1).join(' '));
  }

  // Get coordinates and calculate distance
  const [resultLng, resultLat] = convertFromWebMercator(
    result.location.x,
    result.location.y
  );
  const distance = calculateDistance(lng, lat, resultLng, resultLat);

  // Process the result
  const processedResult: ParsedReverseGeocodeResult = {
    displayAddress: removeRegion(titleCase(result.address.Match_addr)) || undefined,
    displayAddressGen: true,
    addressProperties: {
      formattedAddress: titleCase(result.address.Match_addr) || undefined,
      buildingNumberFrom: buildingNumberFrom || undefined,
      buildingNumberTo: buildingNumberTo || undefined,
      streetName: streetName || undefined,
      neighbourhood:
        titleCase(result.address.Neighborhood) ||
        titleCase(result.address.City) ||
        titleCase(result.address.Subregion) ||
        undefined,
      district: getDistrictFromNeighbourhood(result.address.Neighborhood),
      region: getNormalisedRegion(result.address.State, 'en'),
      country: 'HKSAR'
    },
    addressMeta: {
      longitude: resultLng,
      latitude: resultLat,
      distanceFromPoint: distance,
      addressReverseGeocoder: 'hkgov_reverse',
      addressReverseGen: true
    },
    translations: {
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

export async function reverseGeocode(
  lng: number,
  lat: number
): Promise<ParsedReverseGeocodeResult | null> {
  const result = await fetchReverseGeocodeResult(lng, lat);
  if (!result) return null;

  // Parse the response into our canonical format
  const processedResult = processReverseGeocodeResult(result, lng, lat);

  // Perform forward lookup using the Match_addr
  try {
    const forwardResult = await forwardGeocode(result.address.Match_addr);
    if (forwardResult) {
      const fullResult = await processForwardGeocodeResult(
        forwardResult,
        true,
        lng,
        lat
      );
      if (fullResult) {
        // Merge the results, keeping reverse geocode specific fields
        return {
          ...fullResult,
          addressMeta: {
            ...fullResult.addressMeta,
            distanceFromPoint: processedResult.addressMeta.distanceFromPoint,
            addressReverseGeocoder: processedResult.addressMeta.addressReverseGeocoder,
            addressReverseGen: processedResult.addressMeta.addressReverseGen
          }
        };
      }
    }
  } catch (error) {
    console.error('Forward geocoding failed:', error);
  }

  // Return basic result if forward geocoding fails
  return processedResult;
}

export async function forwardGeocode(
  address: string,
  minConfidence: number = 60,
  maxResults: number = 1
): Promise<ALSResult> {
  const endPoint = 'https://www.als.gov.hk/lookup';
  const response = await fetch(
    `${endPoint}?ga=${encodeURIComponent(address)}&t=${minConfidence}&n=${maxResults}`,
    {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip'
      }
    }
  );
  return response.json();
}

export async function geoAddressLookup(geoAddressCode: string): Promise<ALSResult> {
  const endPoint = 'https://www.als.gov.hk/galookup';
  const response = await fetch(`${endPoint}?ga=${geoAddressCode}`, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip'
    }
  });
  return response.json();
}

function parseALSResultToDisplay(
  address: ALSResult['SuggestedAddress'][0],
  lang: 'en' | 'zh-hant' = 'en'
) {
  const pa = address.Address.PremisesAddress;

  if (lang === 'en') {
    const { EngPremisesAddress: eng } = pa;
    const parts = [];

    // Building/Block info
    if (eng.BuildingName) {
      parts.push(eng.BuildingName);
    }
    if (eng.EngBlock.BlockNo) {
      const blockPart =
        eng.EngBlock.BlockDescriptorPrecedenceIndicator === 'Y'
          ? `${eng.EngBlock.BlockDescriptor} ${eng.EngBlock.BlockNo}`
          : `${eng.EngBlock.BlockNo} ${eng.EngBlock.BlockDescriptor}`;
      parts.push(blockPart);
    }

    // Estate/Phase info
    if (eng.EngEstate.EstateName) {
      let estatePart = eng.EngEstate.EstateName;
      if (eng.EngEstate.EngPhase?.PhaseNo) {
        estatePart = `${estatePart} PH ${eng.EngEstate.EngPhase.PhaseNo}`;
      }
      parts.push(estatePart);
    }

    // Street address
    if (eng.EngStreet.BuildingNoFrom) {
      parts.push(eng.EngStreet.BuildingNoFrom);
    }
    if (eng.EngStreet.StreetName) {
      parts.push(
        eng.EngStreet.StreetName.replace('ROAD', 'RD').replace('STREET', 'ST')
      );
    }

    // Area info
    const location =
      eng.EngStreet?.LocationName ||
      eng.EngVillage?.LocationName ||
      eng.EngDistrict.DcDistrict;
    if (location) {
      parts.push(location);
    }

    // Skip Region
    // parts.push(eng.Region);

    return parts.join(', ');
  } else {
    const { ChiPremisesAddress: chi } = pa;
    const parts = [];

    // Building/Block info
    if (chi.BuildingName) {
      parts.push(chi.BuildingName);
    }
    if (chi.ChiBlock.BlockNo) {
      parts.push(`${chi.ChiBlock.BlockNo}${chi.ChiBlock.BlockDescriptor}`);
    }

    // Estate/Phase info
    if (chi.ChiEstate.EstateName) {
      let estatePart = chi.ChiEstate.EstateName;
      if (chi.ChiEstate.ChiPhase?.PhaseNo) {
        estatePart = `${estatePart}第${chi.ChiEstate.ChiPhase.PhaseNo}期`;
      }
      parts.push(estatePart);
    }

    // Street address
    if (chi.ChiStreet.BuildingNoFrom) {
      parts.push(chi.ChiStreet.BuildingNoFrom + '號');
    }
    if (chi.ChiStreet.StreetName) {
      parts.push(chi.ChiStreet.StreetName);
    }

    // Area info
    const location = chi.ChiDistrict.DcDistrict;
    if (location) {
      parts.push(location);
    }

    // Region
    parts.push(chi.Region);

    return parts.join('');
  }
}

export async function processForwardGeocodeResult(
  result: ALSResult,
  existingDisplayAddressGen: boolean | null | undefined,
  lng: number,
  lat: number
): Promise<ReverseGeocodeResult | null> {
  if (!result.SuggestedAddress?.length) return null;

  const address = result.SuggestedAddress[0];
  const { PremisesAddress: pa } = address.Address;

  // Only generate display addresses if allowed
  const shouldGenerateDisplay =
    existingDisplayAddressGen === null || existingDisplayAddressGen === true;
  const displayAddressEn = shouldGenerateDisplay
    ? parseALSResultToDisplay(address, 'en')
    : undefined;
  const displayAddressZh = shouldGenerateDisplay
    ? parseALSResultToDisplay(address, 'zh-hant')
    : undefined;

  // Prepare Chinese address properties
  const zhHantAddressProps: Partial<AddressProperties> = {
    buildingName: pa.ChiPremisesAddress.BuildingName,
    buildingNumberFrom: pa.ChiPremisesAddress.ChiStreet.BuildingNoFrom,
    buildingNumberTo: pa.ChiPremisesAddress.ChiStreet.BuildingNoTo,
    blockType: pa.ChiPremisesAddress.ChiBlock.BlockDescriptor,
    blockNumber: pa.ChiPremisesAddress.ChiBlock.BlockNo,
    estateName: pa.ChiPremisesAddress.ChiEstate.EstateName,
    streetName: pa.ChiPremisesAddress.ChiStreet.StreetName,
    district: getNormalisedDistrict(
      pa.ChiPremisesAddress.ChiDistrict.DcDistrict,
      'zh-hant'
    ),
    region: getNormalisedRegion(pa.ChiPremisesAddress.Region, 'zh-hant')
  };

  // Translate Chinese properties to Simplified Chinese
  let zhHansAddressProps: Partial<AddressProperties> = {};
  if (displayAddressZh) {
    try {
      const propsToTranslate = Object.values(zhHantAddressProps).filter(Boolean);
      const response = await fetch('/api/translation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceLang: 'zh-hant',
          targetLang: 'zh-hans',
          texts: [displayAddressZh, ...propsToTranslate]
        })
      });
      const data = await response.json();
      const [translatedDisplay, ...translatedProps] = data.translations;

      // Map translated properties back to their keys
      let propIndex = 0;
      zhHansAddressProps = Object.fromEntries(
        Object.entries(zhHantAddressProps).map(([key, value]) => [
          key,
          value ? translatedProps[propIndex++] : value
        ])
      );

      // Add the translated display address
      if (shouldGenerateDisplay) {
        zhHansAddressProps.displayAddress = translatedDisplay;
      }
    } catch (error) {
      console.error('Translation failed:', error);
    }
  }

  const addressProperties: AddressProperties = {
    buildingName: capitalizeFirstLetter(pa.EngPremisesAddress.BuildingName),
    buildingNumberFrom: pa.EngPremisesAddress.EngStreet.BuildingNoFrom,
    buildingNumberTo: pa.EngPremisesAddress.EngStreet.BuildingNoTo,
    blockType: capitalizeFirstLetter(pa.EngPremisesAddress.EngBlock.BlockDescriptor),
    blockNumber: pa.EngPremisesAddress.EngBlock.BlockNo,
    blockTypeBeforeNumber:
      pa.EngPremisesAddress.EngBlock.BlockDescriptorPrecedenceIndicator === 'Y',
    phaseName: pa.EngPremisesAddress.EngEstate.EngPhase?.PhaseName
      ? capitalizeFirstLetter(pa.EngPremisesAddress.EngEstate.EngPhase.PhaseName)
      : undefined,
    phaseNumber: pa.EngPremisesAddress.EngEstate.EngPhase?.PhaseNo,
    estateName: capitalizeFirstLetter(pa.EngPremisesAddress.EngEstate.EstateName),
    streetName: capitalizeFirstLetter(pa.EngPremisesAddress.EngStreet.StreetName),
    neighbourhood: pa.EngPremisesAddress.EngStreet.EngVillage?.LocationName
      ? getFirstLocation(pa.EngPremisesAddress.EngStreet.EngVillage.LocationName)
      : undefined,
    district: getNormalisedDistrict(pa.EngPremisesAddress.EngDistrict.DcDistrict, 'en'),
    region: getNormalisedRegion(pa.EngPremisesAddress.Region, 'en'),
    country: 'HKSAR'
  };

  const addressMeta: AddressMeta = {
    geoAddressCode: pa.GeoAddress,
    distanceFromPoint: calculateDistance(
      lng,
      lat,
      parseFloat(pa.GeospatialInformation.Longitude),
      parseFloat(pa.GeospatialInformation.Latitude)
    ),
    longitude: parseFloat(pa.GeospatialInformation.Longitude),
    latitude: parseFloat(pa.GeospatialInformation.Latitude),
    confidenceForwardGeocoder: address.ValidationInformation.Score,
    addressForwardGeocoder: 'hkgov_als',
    addressForwardGen: true
  };

  return {
    displayAddress: displayAddressEn,
    displayAddressGen: shouldGenerateDisplay,
    addressProperties,
    addressMeta,
    translations: {
      'zh-hant': {
        displayAddress: displayAddressZh,
        displayAddressGen: shouldGenerateDisplay,
        addressProperties: zhHantAddressProps
      },
      'zh-hans': {
        displayAddress: zhHansAddressProps.displayAddress,
        displayAddressGen: shouldGenerateDisplay,
        addressProperties: zhHansAddressProps
      }
    }
  };
}
