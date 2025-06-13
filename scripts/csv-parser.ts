// FRAMEWORK
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { nanoid } from 'nanoid';

// Load environment variables from .env file
function loadEnvVars() {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars: Record<string, string> = {};

    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          envVars[key.trim()] = valueParts
            .join('=')
            .trim()
            .replace(/^["']|["']$/g, '');
        }
      }
    });

    return envVars;
  }
  return {};
}

// Load environment variables
const envVars = loadEnvVars();

// GEOCODING - inline to avoid SvelteKit env issues
// DATA
import neighbourhoods from '../src/lib/map/neighbourhoods.json' assert { type: 'json' };
import properties from '../src/lib/db/data/property.json' assert { type: 'json' };

// UTILS
import {
  calculateDistance,
  capitalizeFirstLetter,
  getFirstLocation,
  getNormalisedDistrict,
  getNormalisedRegion,
  removeRegion,
  titleCase,
  applyAddressAbbreviations,
  getNormalisedCountry,
  districtCodeToName
} from '../src/lib/utils/geocoding.js';

// TYPES for geocoding
import type {
  AddressProperties,
  ReverseGeocodeResult,
  ParsedReverseGeocodeResult,
  ALSResult,
  ALSSuggestedAddressItem
} from '../src/lib/types.js';

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

// GEOCODING FUNCTIONS
function convertToWebMercator(lng: number, lat: number): [number, number] {
  const x = (lng * 20037508.34) / 180;
  const y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  return [x, (y * 20037508.34) / 180];
}

function convertFromWebMercator(x: number, y: number): [number, number] {
  const lng = (x * 180) / 20037508.34;
  const lat = (Math.atan(Math.exp((y * Math.PI) / 20037508.34)) * 360) / Math.PI - 90;
  return [lng, lat];
}

function getDistrictFromNeighbourhood(
  neighbourhoodRef: string | null,
  locale: Locale = 'en'
): string | null {
  if (!neighbourhoodRef) return null;
  const neighbourhoodNames = Object.keys(neighourhoodsJson) as Neighbourhood[];
  const neighbourhood = neighbourhoodNames.find(
    (n) => n.toLowerCase() === neighbourhoodRef.toLowerCase()
  );
  return neighbourhood
    ? neighourhoodsJson[neighbourhood].i18n[locale].district || null
    : null;
}

function extractNeighbourhoodFromAddress(address: string): string | null {
  const neighbourhoodNames = Object.keys(neighbourhoods);
  const neighbourhoodMatch = neighbourhoodNames.find((n) =>
    address.toLowerCase().includes(n.toLowerCase())
  );
  return neighbourhoodMatch ? neighbourhoodMatch : null;
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

async function fetchForwardGeocodeALSResult(
  address: string,
  neighbourhood: string | null = null,
  minConfidence: number = 60,
  maxResults: number = 1
): Promise<ALSResult> {
  const endPoint = 'https://www.als.gov.hk/lookup';
  const response = await fetch(
    `${endPoint}?q=${encodeURIComponent(address)}&t=${minConfidence}&n=${maxResults}`,
    {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'Accept-Language': 'en-US,en;q=0.9,zh-HK;q=0.8,zh;q=0.7,zh-hant;q=0.7'
      }
    }
  );
  const result = await response.json();
  return result;
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
    streetName = capitalizeFirstLetter(
      applyAddressAbbreviations(streetParts.slice(1).join(' '))
    );
  }

  // Get coordinates and calculate distance
  const [resultLng, resultLat] = convertFromWebMercator(
    result.location.x,
    result.location.y
  );
  const distance = calculateDistance(lng, lat, resultLng, resultLat);

  // Get district from neighborhood (handle null neighborhood)
  const neighborhood =
    result.address.Neighborhood || result.address.City || result.address.Subregion;
  const district = neighborhood
    ? getDistrictFromNeighbourhood(neighborhood, 'en')
    : null;

  // Create display address - ensure it exists
  const rawDisplayAddress = result.address.Match_addr;
  const processedDisplayAddress = rawDisplayAddress
    ? removeRegion(titleCase(applyAddressAbbreviations(rawDisplayAddress)))
    : undefined;

  // Process the result
  const processedResult: ParsedReverseGeocodeResult = {
    addressMeta: {
      longitude: resultLng,
      latitude: resultLat,
      distanceFromPoint: distance,
      addressReverseGeocoder: 'hkgov_reverse',
      addressReverseGen: true
    },
    i18n: {
      en: {
        displayAddress: processedDisplayAddress,
        displayAddressGen: true,
        addressProperties: {
          formattedAddress: titleCase(result.address.Match_addr) || undefined,
          buildingNumberFrom,
          buildingNumberTo,
          streetName,
          neighbourhood: titleCase(neighborhood) || undefined,
          district: district,
          region: getNormalisedRegion(result.address.State, 'en'),
          country: 'HKSAR'
        }
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

async function processForwardGeocodeResult(
  result: ALSResult,
  neighbourhood: string | null | undefined,
  genDisplayAddress: boolean,
  lng: number,
  lat: number
): Promise<ParsedReverseGeocodeResult | null> {
  if (!result.SuggestedAddress?.length) return null;

  const address = result.SuggestedAddress[0];
  const { PremisesAddress: pa } = address.Address;

  const neighbourhoodZhHant =
    neighbourhoods[neighbourhood as keyof typeof neighbourhoods]?.i18n['zh-hant']
      ?.neighbourhood || null;

  // Only generate display addresses if allowed
  const displayAddressEn = genDisplayAddress
    ? parseALSResultToDisplay(address, neighbourhood ?? null, 'en')
    : undefined;
  const displayAddressZhHant = genDisplayAddress
    ? parseALSResultToDisplay(address, neighbourhoodZhHant, 'zh-hant')
    : undefined;
  let displayAddressZhHans: string | undefined = undefined;

  // Prepare Chinese address properties
  let addressPropsZhHant: Partial<AddressProperties> = {};
  if ('ChiPremisesAddress' in pa) {
    addressPropsZhHant = {
      buildingName: pa.ChiPremisesAddress.BuildingName || undefined,
      buildingNumberFrom: pa.ChiPremisesAddress.ChiStreet?.BuildingNoFrom || undefined,
      buildingNumberTo: pa.ChiPremisesAddress.ChiStreet?.BuildingNoTo || undefined,
      blockType: pa.ChiPremisesAddress.ChiBlock?.BlockDescriptor || undefined,
      blockNumber: pa.ChiPremisesAddress.ChiBlock?.BlockNo || undefined,
      estateName: pa.ChiPremisesAddress.ChiEstate?.EstateName || undefined,
      streetName: pa.ChiPremisesAddress.ChiStreet?.StreetName || undefined,
      neighbourhood: neighbourhoodZhHant || undefined,
      district: getNormalisedDistrict(
        pa.ChiPremisesAddress.ChiDistrict?.DcDistrict,
        'zh-hant'
      ),
      region: getNormalisedRegion(pa.ChiPremisesAddress?.Region, 'zh-hant'),
      country: getNormalisedCountry('Hong Kong', 'zh-hant')
    };
  }

  // Translate Chinese properties to Simplified Chinese - USE OUR LOCAL getTranslation
  let addressPropsZhHans: Partial<AddressProperties> = {};
  if ('ChiPremisesAddress' in pa) {
    try {
      const propsToTranslate = Object.values(addressPropsZhHant).filter(Boolean);
      if (displayAddressZhHant && propsToTranslate.length > 0) {
        const translations = await getTranslation('zh-hant', 'zh-hans', [
          displayAddressZhHant,
          ...propsToTranslate
        ]);
        displayAddressZhHans = translations[0];

        // Map translated properties back to their keys
        let propIndex = 0;
        addressPropsZhHans = Object.fromEntries(
          Object.entries(addressPropsZhHant).map(([key, value]) => [
            key,
            value ? translations[propIndex++ + 1] : value
          ])
        );
      }
    } catch (error) {
      console.error('Translation failed:', error);
    }
  }

  const addressPropertiesEn: AddressProperties = {
    buildingName: pa.EngPremisesAddress.BuildingName
      ? titleCase(pa.EngPremisesAddress.BuildingName)
      : undefined,
    buildingNumberFrom: pa.EngPremisesAddress.EngStreet.BuildingNoFrom,
    buildingNumberTo: pa.EngPremisesAddress.EngStreet.BuildingNoTo,
    blockType: pa.EngPremisesAddress?.EngBlock?.BlockDescriptor
      ? titleCase(pa.EngPremisesAddress.EngBlock.BlockDescriptor)
      : undefined,
    blockNumber: pa.EngPremisesAddress?.EngBlock?.BlockNo,
    blockTypeBeforeNumber:
      'EngBlock' in pa.EngPremisesAddress
        ? pa.EngPremisesAddress?.EngBlock?.BlockDescriptorPrecedenceIndicator === 'Y'
        : undefined,
    phaseName: pa.EngPremisesAddress?.EngEstate?.EngPhase?.PhaseName
      ? titleCase(pa.EngPremisesAddress.EngEstate.EngPhase.PhaseName)
      : undefined,
    phaseNumber: pa.EngPremisesAddress?.EngEstate?.EngPhase?.PhaseNo,
    estateName: pa.EngPremisesAddress?.EngEstate?.EstateName
      ? titleCase(pa.EngPremisesAddress.EngEstate.EstateName)
      : undefined,
    streetName: pa.EngPremisesAddress?.EngStreet?.StreetName
      ? titleCase(pa.EngPremisesAddress.EngStreet.StreetName)
      : undefined,
    neighbourhood: neighbourhood
      ? neighbourhood
      : pa.EngPremisesAddress?.EngStreet?.EngVillage?.LocationName
        ? getFirstLocation(pa.EngPremisesAddress?.EngStreet?.EngVillage?.LocationName)
        : undefined,
    district: pa.EngPremisesAddress?.EngDistrict?.DcDistrict
      ? getNormalisedDistrict(pa.EngPremisesAddress.EngDistrict.DcDistrict, 'en')
      : undefined,
    region: pa.EngPremisesAddress?.Region
      ? getNormalisedRegion(pa.EngPremisesAddress.Region, 'en')
      : undefined,
    country: getNormalisedCountry('Hong Kong', 'en')
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
    addressMeta: Object.fromEntries(
      Object.entries(addressMeta).filter(([_, value]) => value !== undefined)
    ),
    i18n: {
      en: {
        displayAddress: displayAddressEn,
        displayAddressGen: genDisplayAddress,
        addressProperties: Object.fromEntries(
          Object.entries(addressPropertiesEn).filter(
            ([_, value]) => value !== undefined
          )
        )
      },
      'zh-hant': {
        displayAddress: displayAddressZhHant,
        displayAddressGen: genDisplayAddress,
        addressProperties: Object.fromEntries(
          Object.entries(addressPropsZhHant).filter(([_, value]) => value !== undefined)
        )
      },
      'zh-hans': {
        displayAddress: displayAddressZhHans,
        displayAddressGen: genDisplayAddress,
        addressProperties: Object.fromEntries(
          Object.entries(addressPropsZhHans).filter(([_, value]) => value !== undefined)
        )
      }
    }
  };
}

function parseALSResultToDisplay(
  address: ALSSuggestedAddressItem,
  neighbourhood: string | null,
  locale: Exclude<Locale, 'zh-hans'> = 'en'
) {
  const pa = address.Address.PremisesAddress;

  if (locale === 'en') {
    const { EngPremisesAddress: eng } = pa;
    const parts = [];

    // Building/Block info
    if (eng.BuildingName) {
      parts.push(eng.BuildingName);
    }
    if (eng.EngBlock) {
      const blockPart =
        eng.EngBlock.BlockDescriptorPrecedenceIndicator === 'Y'
          ? `${eng.EngBlock.BlockDescriptor} ${eng.EngBlock.BlockNo}`
          : `${eng.EngBlock.BlockNo} ${eng.EngBlock.BlockDescriptor}`;
      parts.push(blockPart);
    }

    // Estate/Phase info
    if (eng.EngEstate) {
      let estatePart = eng.EngEstate.EstateName;
      if (eng.EngEstate.EngPhase?.PhaseNo) {
        estatePart = `${estatePart} PH ${eng.EngEstate.EngPhase.PhaseNo}`;
      }
      parts.push(estatePart);
    }

    // Street address
    if (eng.EngStreet) {
      let streetAddress = '';
      if (eng.EngStreet.BuildingNoFrom) {
        streetAddress = eng.EngStreet.BuildingNoFrom;
      }
      if (eng.EngStreet.BuildingNoTo) {
        streetAddress = `${streetAddress}-${eng.EngStreet.BuildingNoTo}`;
      }
      streetAddress = `${streetAddress} ${eng.EngStreet.StreetName}`;
      parts.push(streetAddress);
    }

    // Area info
    if (neighbourhood) {
      parts.push(neighbourhood);
    } else {
      const districtKey = getNormalisedDistrict(eng.EngDistrict.DcDistrict, 'en');
      const districtNameFromCode = districtKey
        ? districtCodeToName[districtKey as keyof typeof districtCodeToName]
        : undefined;
      const location = eng.EngStreet?.EngVillage?.LocationName || districtNameFromCode;
      if (location) {
        parts.push(location);
      }
    }

    return removeRegion(titleCase(applyAddressAbbreviations(parts.join(', '))));
  } else {
    if (!('ChiPremisesAddress' in pa)) return null;
    const { ChiPremisesAddress: chi } = pa;
    const parts = [];

    // Building/Block info
    if (chi.BuildingName) {
      parts.push(chi.BuildingName);
    }
    if (chi.ChiBlock) {
      parts.push(`${chi.ChiBlock.BlockNo}${chi.ChiBlock.BlockDescriptor}`);
    }

    // Estate/Phase info
    if (chi.ChiEstate) {
      let estatePart = chi.ChiEstate.EstateName;
      if (chi.ChiEstate.ChiPhase?.PhaseNo) {
        estatePart = `${estatePart}第${chi.ChiEstate.ChiPhase.PhaseNo}期`;
      }
      parts.push(estatePart);
    }

    // Street address
    if (chi.ChiStreet) {
      parts.push(chi.ChiStreet.StreetName);
      if (chi.ChiStreet.BuildingNoFrom) {
        parts.push(chi.ChiStreet.BuildingNoFrom + '號');
      }
    }

    // Area info
    const location = chi.ChiDistrict.DcDistrict;
    if (location) {
      parts.push(location);
    }

    // Skip adding region to avoid regional suffixes
    // parts.push(chi.Region);

    return parts.join('');
  }
}

async function reverseGeocode(
  lng: number,
  lat: number
): Promise<ParsedReverseGeocodeResult | null> {
  const result = await fetchReverseGeocodeResult(lng, lat);
  if (!result) {
    return null;
  }

  // Parse the response into our canonical format
  const processedResult = processReverseGeocodeResult(result, lng, lat);

  if (!processedResult) {
    return null;
  }

  // Perform forward lookup using the Match_addr
  try {
    // Use English address properties to perform forward geocoding
    const addressProperties = processedResult?.i18n.en.addressProperties;
    const streetAddress = `${addressProperties?.buildingNumberFrom} ${addressProperties?.streetName}`;

    const forwardResult = await fetchForwardGeocodeALSResult(
      streetAddress,
      addressProperties?.neighbourhood
    );

    if (forwardResult) {
      const fullResult = await processForwardGeocodeResult(
        forwardResult,
        addressProperties?.neighbourhood,
        true,
        lng,
        lat
      );
      if (fullResult) {
        // Merge the results, keeping reverse geocode specific fields
        const mergedResult = {
          ...fullResult,
          addressMeta: {
            ...fullResult.addressMeta,
            distanceFromPoint: processedResult?.addressMeta?.distanceFromPoint,
            addressReverseGeocoder:
              processedResult?.addressMeta?.addressReverseGeocoder,
            addressReverseGen: processedResult?.addressMeta?.addressReverseGen
          },
          // The reverse geocoder result is cleaner than the forward geocoder result
          i18n: {
            ...fullResult.i18n,
            en: {
              ...fullResult.i18n.en,
              displayAddress: processedResult?.i18n?.en?.displayAddress
            }
          }
        };
        return mergedResult;
      }
    }
  } catch (error) {
    console.error('Forward geocoding failed:', error);
  }

  return processedResult;
}

// Translation service - create our own version
import { v4 as uuidv4 } from 'uuid';
import type { Locale } from '../src/lib/types.js';

const TRANSLATION_ENDPOINT = 'https://api.cognitive.microsofttranslator.com';
const TRANSLATION_REGION =
  envVars.PUBLIC_AZURE_TRANSLATION_REGION ||
  process.env.PUBLIC_AZURE_TRANSLATION_REGION ||
  '';
const TRANSLATION_KEY =
  envVars.PRIVATE_AZURE_TRANSLATION_KEY ||
  process.env.PRIVATE_AZURE_TRANSLATION_KEY ||
  '';

const localeToApiLanguageTag = (
  source: Locale,
  target: Locale
): { sourceLocale: string; targetLocale: string } => {
  const sourceMaps = {
    en: 'en',
    'zh-hant': 'yue',
    'zh-hans': 'zh-Hans'
  };
  const targetMaps = {
    en: 'en',
    'zh-hant': 'yue',
    'zh-hans': 'zh-Hans'
  };
  return {
    sourceLocale: sourceMaps[source as keyof typeof sourceMaps] || source,
    targetLocale: targetMaps[target as keyof typeof targetMaps] || target
  };
};

async function getTranslation(
  source: Locale,
  target: Locale,
  texts: string[]
): Promise<string[]> {
  const { sourceLocale, targetLocale } = localeToApiLanguageTag(source, target);
  return await fetch(
    `${TRANSLATION_ENDPOINT}/translate?api-version=3.0&from=${sourceLocale}&to=${targetLocale}`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': TRANSLATION_KEY,
        'Ocp-Apim-Subscription-Region': TRANSLATION_REGION,
        'Content-type': 'application/json',
        'X-ClientTraceId': uuidv4().toString()
      },
      body: JSON.stringify(
        texts.map((text) => ({
          text: text
        }))
      )
    }
  )
    .then((response) => response.json())
    .then((data) => {
      return data.map((item: Record<string, any>) => item.translations[0].text);
    });
}

// ENUMS
import { supportedLocales } from '../src/lib/enums.js';

// TYPES
import type { GeometryObject } from 'geojson';
import type { AddressMeta } from '../src/lib/types.js';

interface CSVRow {
  id: string;
  'property.grapheme.value': string;
  'i18n.en.title': string;
  'i18n.zh_hant.title': string;
  'i18n.en.descrtipion': string;
  longitude: string;
  latitude: string;
  'i18n.en.displayAddress': string;
  visitableAsOf: string;
  imageUrl: string;
}

interface FeatureRecord {
  id: string;
  geometry: GeometryObject;
  addressMeta: AddressMeta;
  layerId: string;
  contributorId: string;
  publisherId: string;
  isPublished: boolean;
  publishedAt: string;
  isIntangible: boolean;
  isVisitable: boolean;
  visitableAsOf: string | null;
}

interface FeatureI18nRecord {
  featureId: string;
  locale: Locale;
  title: string;
  titleGen: boolean;
  description: string | null;
  descriptionGen: boolean;
  displayAddress: string | undefined;
  displayAddressGen: boolean;
  addressProperties: Record<string, unknown>;
}

interface FeaturePropertyRecord {
  featureId: string;
  propertyId: string;
  value: string;
}

// Constants
const LAYER_ID = '7akti7OImSFg';
const CONTRIBUTOR_ID = 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM';
const PUBLISHER_ID = 'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM';

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseCSV(
  filePath: string,
  testMode: boolean = true,
  fixupMode: boolean = false
): Promise<void> {
  console.log('🔄 Starting CSV parsing...');

  // Warn about conflicting modes
  if (testMode && fixupMode) {
    console.log(
      '⚠️  Running in both test mode and fixup mode - will process only 5 random rows that need fixing'
    );
  }

  // Check if we have required environment variables
  if (!TRANSLATION_KEY || !TRANSLATION_REGION) {
    console.error('❌ Missing required environment variables:');
    if (!TRANSLATION_KEY) console.error('  - PRIVATE_AZURE_TRANSLATION_KEY');
    if (!TRANSLATION_REGION) console.error('  - PUBLIC_AZURE_TRANSLATION_REGION');
    process.exit(1);
  }

  // Load existing features if in fixup mode
  let existingFeatureIds: Set<string> = new Set();
  if (fixupMode) {
    const existingFeaturesPath = path.join(
      process.cwd(),
      'scripts',
      'data',
      'export',
      'features-hkghostsigns.json'
    );
    if (fs.existsSync(existingFeaturesPath)) {
      try {
        const existingFeatures = JSON.parse(
          fs.readFileSync(existingFeaturesPath, 'utf8')
        );
        existingFeatureIds = new Set(existingFeatures.map((f: FeatureRecord) => f.id));
        console.log(
          `📋 Loaded ${existingFeatureIds.size} existing feature IDs for fixup mode`
        );
      } catch (error) {
        console.error('❌ Failed to load existing features:', error);
        process.exit(1);
      }
    } else {
      console.log('📋 No existing features file found, will process all rows');
    }
  }

  // Read CSV file
  const csvContent = fs.readFileSync(filePath, 'utf8');
  const parsed = Papa.parse<CSVRow>(csvContent, {
    header: true,
    skipEmptyLines: true
  });

  let rows = parsed.data;
  if (testMode) {
    // Select 5 random rows for testing
    const shuffled = [...parsed.data].sort(() => 0.5 - Math.random());
    rows = shuffled.slice(0, 5);
    console.log(
      `📊 Processing 5 random rows from ${parsed.data.length} total (test mode: ${testMode}, fixup mode: ${fixupMode})`
    );
    console.log(
      `🎲 Selected row indices: ${rows.map((row) => parsed.data.indexOf(row) + 1).join(', ')}`
    );
  } else {
    console.log(
      `📊 Processing ${rows.length} rows (test mode: ${testMode}, fixup mode: ${fixupMode})`
    );
  }

  const features: FeatureRecord[] = [];
  const featureI18n: FeatureI18nRecord[] = [];
  const featureProperties: FeaturePropertyRecord[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Skip if missing title
    if (!row['i18n.en.title']) {
      console.log(`⏭️  Skipping row ${i + 1}: missing English title`);
      continue;
    }

    // Skip if in fixup mode and ID already exists or is 'NEW'
    if (fixupMode) {
      if (row.id === 'NEW') {
        console.log(`⏭️  Skipping row ${i + 1}: ID is 'NEW' (already handled)`);
        continue;
      }
      if (existingFeatureIds.has(row.id)) {
        console.log(`⏭️  Skipping row ${i + 1}: ID '${row.id}' already exists`);
        continue;
      }
    }

    console.log(`\n🔄 Processing row ${i + 1}: "${row['i18n.en.title']}"`);

    // Generate ID
    const featureId = row.id === 'NEW' ? nanoid(12) : row.id;
    console.log(`🆔 Feature ID: ${featureId}`);

    // Parse coordinates
    const longitude = parseFloat(row.longitude);
    const latitude = parseFloat(row.latitude);
    console.log(`📍 Coordinates: ${longitude}, ${latitude}`);

    // Create geometry
    const geometry: GeometryObject = {
      type: 'Point',
      coordinates: [longitude, latitude]
    };

    // Call reverse geocoding
    console.log('🌐 Calling reverse geocoding...');
    const geocodeResult = await reverseGeocode(longitude, latitude);

    if (!geocodeResult) {
      console.log('❌ Reverse geocoding failed, skipping this row');
      continue;
    }

    console.log('✅ Reverse geocoding successful');

    // Create feature record
    const currentDate = new Date().toISOString();
    const feature: FeatureRecord = {
      id: featureId,
      geometry,
      addressMeta: geocodeResult.addressMeta,
      layerId: LAYER_ID,
      contributorId: CONTRIBUTOR_ID,
      publisherId: PUBLISHER_ID,
      isPublished: true,
      publishedAt: currentDate,
      isIntangible: false,
      isVisitable: true,
      visitableAsOf: row.visitableAsOf || '2024-01-01' || null
    };

    features.push(feature);

    // Create i18n records for each locale
    for (const locale of supportedLocales) {
      console.log(`🌍 Processing locale: ${locale}`);

      let title = '';
      let titleGen = false;
      let description: string | null = null;
      let descriptionGen = false;

      if (locale === 'en') {
        // Use English values directly (with trimming)
        title = row['i18n.en.title']?.trim() || '';
        titleGen = false;
        description = row['i18n.en.descrtipion']?.trim() || null;
        descriptionGen = false;
      } else {
        // Translate from English (with trimming)
        const textsToTranslate: string[] = [row['i18n.en.title']?.trim() || ''];
        if (row['i18n.en.descrtipion']?.trim()) {
          textsToTranslate.push(row['i18n.en.descrtipion'].trim());
        }

        if (textsToTranslate.length > 0) {
          console.log(`🔄 Translating to ${locale}...`);
          try {
            const translations = await getTranslation('en', locale, textsToTranslate);
            title = translations[0];
            titleGen = true;
            description = translations[1] || null;
            descriptionGen = !!translations[1];
          } catch (error) {
            console.error(`❌ Translation failed for ${locale}:`, error);
            title = row['i18n.en.title']; // Fallback to English
            titleGen = true;
            description = row['i18n.en.descrtipion'] || null;
            descriptionGen = false;
          }
        }
      }

      // Get display address and address properties from geocoding result
      const i18nData = geocodeResult.i18n[locale as keyof typeof geocodeResult.i18n];
      const displayAddress = i18nData?.displayAddress;
      const addressProperties = i18nData?.addressProperties || {};

      const featureI18nRecord: FeatureI18nRecord = {
        featureId,
        locale: locale as Locale,
        title,
        titleGen,
        description,
        descriptionGen,
        displayAddress,
        displayAddressGen: true,
        addressProperties
      };

      featureI18n.push(featureI18nRecord);
    }

    // Create property records for all properties
    const propertyKeys: string[] = [];

    // Handle each property from property.json
    for (const property of properties) {
      if (property.type === 'classifier') {
        const featureProperty: any = {
          featureId,
          propertyId: property.id,
          propertyValueId: property.key === 'collection' ? 'tU5v28xY1zA4' : undefined
        };
        featureProperties.push(featureProperty);
        propertyKeys.push(property.key);
      } else if (property.type === 'specifier') {
        if (property.key === 'graphemes') {
          // Handle graphemes from CSV data - always create record, even if empty
          const graphemeValue = row['property.grapheme.value']?.trim() || undefined;
          const featureProperty: any = {
            featureId,
            propertyId: property.id,
            value: graphemeValue
          };
          featureProperties.push(featureProperty);

          if (graphemeValue) {
            propertyKeys.push(`${property.key}="${graphemeValue}"`);
          } else {
            propertyKeys.push(`${property.key}=N/A`);
          }
        } else {
          // Other specifier properties with empty values
          const featureProperty: FeaturePropertyRecord = {
            featureId,
            propertyId: property.id,
            value: ''
          };
          featureProperties.push(featureProperty);
          propertyKeys.push(property.key);
        }
      }
    }

    console.log(`📝 Added properties: ${propertyKeys.join(', ')}`);

    // Wait 1 second between requests
    if (i < rows.length - 1) {
      console.log('⏳ Waiting 1 second...');
      await sleep(1000);
    }
  }

  // Write output files
  console.log('\n📝 Writing output files...');

  const outputDir = path.join(process.cwd(), 'scripts', 'data', 'export');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Use suffix for fixup mode
  const suffix = fixupMode ? '-fix' : '';

  // Write features file
  const featuresPath = path.join(outputDir, `features-hkghostsigns${suffix}.json`);
  fs.writeFileSync(featuresPath, JSON.stringify(features, null, 2));
  console.log(
    `✅ Created ${featuresPath.split('/').pop()} with ${features.length} features`
  );

  // Write feature i18n file
  const featureI18nPath = path.join(outputDir, `featureI18n${suffix}.json`);
  fs.writeFileSync(featureI18nPath, JSON.stringify(featureI18n, null, 2));
  console.log(
    `✅ Created ${featureI18nPath.split('/').pop()} with ${featureI18n.length} records`
  );

  // Write feature properties file (if any)
  if (featureProperties.length > 0) {
    const propertiesPath = path.join(outputDir, `featureProperties${suffix}.json`);
    fs.writeFileSync(propertiesPath, JSON.stringify(featureProperties, null, 2));
    console.log(
      `✅ Created ${propertiesPath.split('/').pop()} with ${featureProperties.length} properties`
    );
  }

  console.log('\n🎉 Parsing complete!');
  console.log(
    `📊 Summary: ${features.length} features, ${featureI18n.length} i18n records, ${featureProperties.length} properties`
  );
}

// Main execution
const csvPath = path.join(
  process.cwd(),
  'scripts',
  'data',
  'source',
  'GhostSigns - Master - Database Ingestion - 20250605.csv'
);
const testMode = process.argv.includes('--full') ? false : true;
const fixupMode = process.argv.includes('--fixup');

parseCSV(csvPath, testMode, fixupMode)
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
