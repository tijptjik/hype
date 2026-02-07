// SERVICES
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
  districtCodeToName,
} from '$lib/utils/geocoding'
// DATA
import neighbourhoods from '$lib/map/neighbourhoods.json'
// TYPES
import type {
  AddressProperties,
  AddressMeta,
  ReverseGeocodeResult,
  ParsedReverseGeocodeResult,
  ALSResult,
  ALSSuggestedAddressItem,
  Locale,
} from '$lib/types'

// TYPES
type Neighbourhood = string
type NeighbourhoodI18n = Record<
  Locale,
  {
    name: string
    neighbourhood: string
    district: string
    region: string
  }
>
type Neighbourhoods = Record<Neighbourhood, Record<'i18n', NeighbourhoodI18n>>

const neighourhoodsJson: Neighbourhoods = neighbourhoods

/************
 * LOOKUPS
 ************/

const neighbourhoodKeys = Object.keys(neighourhoodsJson)

function getCanonicalSubNeighbourhoods(): Neighbourhood[] {
  return Object.values(neighourhoodsJson).map(n => n.i18n.en.name)
}

function getCanonicalNeighbourhoods(): Neighbourhood[] {
  return Array.from(
    new Set(Object.values(neighourhoodsJson).map(n => n.i18n.en.neighbourhood)),
  )
}

function getCanonicalDistricts(): string[] {
  return Array.from(
    new Set(Object.values(neighourhoodsJson).map(n => n.i18n.en.district)),
  )
}

// Handle disambiguation of neighbourhoods with the same name, e.g. Ping Shan in Kwun Tong vs Yuen Long
function getKeyFromSubNeighbourhoodAndDistrict(
  name: string,
  district: string,
): Neighbourhood {
  if (neighbourhoodKeys.includes(`${name}, ${district}`)) {
    return `${name}, ${district}`
  }

  return name
}

const canonicalSubNeighbourhoods = getCanonicalSubNeighbourhoods()
const canonicalNeighbourhoods = getCanonicalNeighbourhoods()
const canonicalDistricts = getCanonicalDistricts()

/************
 * UTILS
 ************/

/**
 * Convert WGS84 coordinates to Web Mercator (EPSG:3857)
 * @param lng - The longitude of the point to convert
 * @param lat - The latitude of the point to convert
 * @returns The Web Mercator coordinates
 */
function convertToWebMercator(lng: number, lat: number): [number, number] {
  const x = (lng * 20037508.34) / 180
  const y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)
  return [x, (y * 20037508.34) / 180]
}

/**
 * Convert Web Mercator (EPSG:3857) coordinates to WGS84
 * @param x - The x coordinate of the point to convert
 * @param y - The y coordinate of the point to convert
 * @returns The WGS84 coordinates
 */
function convertFromWebMercator(x: number, y: number): [number, number] {
  const lng = (x * 180) / 20037508.34
  const lat = (Math.atan(Math.exp((y * Math.PI) / 20037508.34)) * 360) / Math.PI - 90
  return [lng, lat]
}

/**
 * Get the district from a neighbourhood reference
 * @param neighbourhoodRef - The neighbourhood reference to get the district from
 * @param locale - The locale to get the district for
 * @param neighbourhood - The neighbourhood to get the district for (optional) - used to disambiguate neighbourhoods with the same name, e.g. Ping Shan in Kwun Tong vs Yuen Long
 * @returns The district, or null if the neighbourhood reference is not found
 */
function getDistrictFromNeighbourhood(
  neighbourhoodRef: string | null,
  locale: Locale = 'en',
  neighbourhoodRaw?: string | null,
): string | null {
  if (!neighbourhoodRef) return null
  // Canonical neighbourhood names
  const neighbourhoodNames = Object.keys(neighourhoodsJson) as Neighbourhood[]
  const neighbourhood = neighbourhoodNames.find(
    n => n.toLowerCase() === neighbourhoodRef.toLowerCase(),
  )
  return neighbourhood
    ? neighourhoodsJson[neighbourhoodRef].i18n[locale].district || null
    : null
}

/**
 * Extract an English neighbourhood from an address
 * @param address - The address to extract the neighbourhood from
 * @returns The neighbourhood, or null if the neighbourhood is not found
 */
export function extractNeighbourhoodFromAddress(address: string): string | null {
  const neighbourhoodMatch = canonicalSubNeighbourhoods.find(n =>
    address.toLowerCase().includes(n.toLowerCase()),
  )
  return neighbourhoodMatch ? neighbourhoodMatch : null
}

/************
 * GEOCODING
 ************/

/**
 * Fetch a reverse geocoding result from the HK Map Service API
 * @param lng - The longitude of the point to reverse geocode
 * @param lat - The latitude of the point to reverse geocode
 * @returns The reverse geocoding result, or null if the request fails
 */
async function fetchReverseGeocodeResult(
  lng: number,
  lat: number,
): Promise<ReverseGeocodeResult | null> {
  const endPoint = 'https://api.hkmapservice.gov.hk/ags/gc/loc/address/reverseGeocode'
  const [x, y] = convertToWebMercator(lng, lat)
  const params = new URLSearchParams({
    key: '6a40dd75bce8494ea735efd8d97dd820',
    outSR: JSON.stringify({ wkid: 3857 }),
    location: JSON.stringify({
      x,
      y,
      spatialReference: { wkid: 102100, latestWkid: 3857 },
    }),
    distance: '500',
    f: 'json',
  })

  const response = await fetch(`${endPoint}?${params}`)
  const result = await response.json()

  return result?.address ? result : null
}

export async function fetchForwardGeocodeALSResult(
  address: string,
  neighbourhood: string | null = null,
  minConfidence: number = 60,
  maxResults: number = 1,
): Promise<ALSResult> {
  const endPoint = 'https://www.als.gov.hk/lookup'
  const response = await fetch(
    `${endPoint}?q=${encodeURIComponent(address)}&t=${minConfidence}&n=${maxResults}`,
    {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'Accept-Language': 'en-US,en;q=0.9,zh-HK;q=0.8,zh;q=0.7,zh-hant;q=0.7',
      },
    },
  )
  const result = await response.json()
  return result
}

export async function geoAddressLookup(geoAddressCode: string): Promise<ALSResult> {
  const endPoint = 'https://www.als.gov.hk/galookup'
  const response = await fetch(`${endPoint}?ga=${geoAddressCode}`, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'Accept-Language': 'en-US,en;q=0.9,zh-HK;q=0.8,zh;q=0.7,zh-hant;q=0.7',
    },
  })
  return response.json()
}

/************
 * PARSING
 ************/

function parseReverseGeocodeNeighbourhood(neighbourhoodRaw: string | null): {
  neighbourhood: string | null
  discriminant: string | null
} {
  // Priorise the smallest neighbourhood name that matches the input.
  // Examples:
  //    "Ping Shan, Yuen Long", -> "Ping Shan"
  //    "Tai Wai, Sha Tin", -> "Tai Wai"
  //    "Clear Water Bay, Sai Kung", -> "Clear Water Bay"
  //    "Central District", -> "Central"
  //    "Prince Edward", -> "Prince Edward"
  if (!neighbourhoodRaw) return { neighbourhood: null, discriminant: null }

  // Split by comma and try each option until a match is found
  const units = neighbourhoodRaw
    .split(',')
    .map(unit => unit.toLowerCase().replace('district', '').trim())

  for (const unit of units) {
    const neighbourhoodMatch = canonicalSubNeighbourhoods.find(n =>
      unit.includes(n.toLowerCase()),
    )
    if (neighbourhoodMatch) {
      return {
        neighbourhood: neighbourhoodMatch,
        discriminant: neighbourhoodRaw,
      }
    }
  }

  return {
    neighbourhood: null,
    discriminant: null,
  }
}

/**
 * Process a reverse geocoding result
 * @param result - The reverse geocoding result to process
 * @param lng - The longitude of the point to process
 * @param lat - The latitude of the point to process
 * @returns The processed reverse geocoding result
 */
function processReverseGeocodeResult(
  result: ReverseGeocodeResult,
  lng: number,
  lat: number,
): ParsedReverseGeocodeResult | null {
  // Parse street address
  const streetParts = result.address?.Street?.split(' ') || []
  let buildingNumberFrom: string | undefined
  let buildingNumberTo: string | undefined
  let streetName: string | undefined

  if (streetParts.length > 1) {
    const numbers = streetParts[0].split(/[-/]/)
    buildingNumberFrom = numbers[0]
    buildingNumberTo = numbers[1]
    streetName = capitalizeFirstLetter(
      applyAddressAbbreviations(streetParts.slice(1).join(' ')),
    )
  }

  // Get coordinates and calculate distance
  const [resultLng, resultLat] = convertFromWebMercator(
    result.location.x,
    result.location.y,
  )
  const distance = calculateDistance(lng, lat, resultLng, resultLat)

  // Get district from neighbourhood (handle null neighbourhood)
  const { neighbourhood, discriminant: superNeighbourhood } =
    parseReverseGeocodeNeighbourhood(result.address.Neighborhood) ||
    result.address.City ||
    result.address.Subregion
  const district = neighbourhood
    ? getDistrictFromNeighbourhood(neighbourhood, 'en', result.address.Neighborhood)
    : null

  // Create display address - ensure it exists
  const rawDisplayAddress = result.address.Match_addr
  const processedDisplayAddress = rawDisplayAddress
    ? removeRegion(titleCase(applyAddressAbbreviations(rawDisplayAddress)))
    : undefined

  // Process the result
  const processedResult: ParsedReverseGeocodeResult = {
    addressMeta: {
      longitude: resultLng,
      latitude: resultLat,
      distanceFromPoint: distance,
      addressReverseGeocoder: 'hkgov_reverse',
      addressReverseGen: true,
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
          neighbourhood: titleCase(neighbourhood) || undefined,
          district: district,
          region: getNormalisedRegion(result.address.State, 'en'),
          country: 'HKSAR',
        },
      },
      'zh-hant': {
        displayAddress: undefined,
        displayAddressGen: true,
        addressProperties: {},
      },
      'zh-hans': {
        displayAddress: undefined,
        displayAddressGen: true,
        addressProperties: {},
      },
    },
  }

  return processedResult
}

/**
 * Process a forward geocoding result
 * @param result - The forward geocoding result to process
 * @param neighbourhood - The neighbourhood to process
 * @param genDisplayAddress - Whether to generate a display address
 * @param lng - The longitude of the point to process
 * @param lat - The latitude of the point to process
 * @returns The processed forward geocoding result
 */
export async function processForwardGeocodeResult(
  result: ALSResult,
  neighbourhood: string | null | undefined,
  genDisplayAddress: boolean,
  lng: number,
  lat: number,
): Promise<ParsedReverseGeocodeResult | null> {
  if (!result.SuggestedAddress?.length) return null

  const address = result.SuggestedAddress[0]
  const { PremisesAddress: pa } = address.Address

  let neighbourhoodZhHant =
    neighbourhoods[neighbourhood as keyof typeof neighbourhoods]?.i18n['zh-hant']
      ?.neighbourhood || null
  // Attempt with a disambiguated key (district code)
  if (!neighbourhoodZhHant) {
    const compositeKey = `${neighbourhood}, ${getNormalisedDistrict(
      pa.EngPremisesAddress?.EngDistrict?.DcDistrict,
      'en',
    )}`
    neighbourhoodZhHant =
      neighbourhoods[compositeKey as keyof typeof neighbourhoods]?.i18n['zh-hant']
        ?.neighbourhood || null
  }

  // Only generate display addresses if allowed
  const displayAddressEn = genDisplayAddress
    ? parseALSResultToDisplay(address, neighbourhood ?? null, 'en')
    : undefined
  const displayAddressZhHant = genDisplayAddress
    ? parseALSResultToDisplay(address, neighbourhoodZhHant, 'zh-hant')
    : undefined
  let displayAddressZhHans: string | undefined

  // Prepare Chinese address properties
  let addressPropsZhHant: Partial<AddressProperties> = {}
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
        'zh-hant',
      ),
      region: getNormalisedRegion(pa.ChiPremisesAddress?.Region, 'zh-hant'),
      country: getNormalisedCountry('Hong Kong', 'zh-hant'),
    }
  }

  // Translate Chinese properties to Simplified Chinese
  let addressPropsZhHans: Partial<AddressProperties> = {}
  if ('ChiPremisesAddress' in pa) {
    try {
      const propsToTranslate = Object.values(addressPropsZhHant).filter(Boolean)
      const response = await fetch('/api/translation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'zh-hant',
          target: 'zh-hans',
          texts: [displayAddressZhHant, ...propsToTranslate],
        }),
      })
      const [translatedDisplayAddress, ...translatedProps] = await response.json()
      displayAddressZhHans = translatedDisplayAddress

      // Map translated properties back to their keys
      let propIndex = 0
      addressPropsZhHans = Object.fromEntries(
        Object.entries(addressPropsZhHant).map(([key, value]) => [
          key,
          value ? translatedProps[propIndex++] : value,
        ]),
      )
    } catch (error) {
      console.error('Translation failed:', error)
    }
  }

  const addressPropertiesEn: AddressProperties = {
    buildingName: titleCase(pa.EngPremisesAddress.BuildingName),
    buildingNumberFrom: pa.EngPremisesAddress.EngStreet.BuildingNoFrom,
    buildingNumberTo: pa.EngPremisesAddress.EngStreet.BuildingNoTo,
    blockType: titleCase(pa.EngPremisesAddress?.EngBlock?.BlockDescriptor),
    blockNumber: pa.EngPremisesAddress?.EngBlock?.BlockNo,
    blockTypeBeforeNumber:
      'EngBlock' in pa.EngPremisesAddress
        ? pa.EngPremisesAddress?.EngBlock?.BlockDescriptorPrecedenceIndicator === 'Y'
        : undefined,
    phaseName: pa.EngPremisesAddress?.EngEstate?.EngPhase?.PhaseName
      ? titleCase(pa.EngPremisesAddress.EngEstate.EngPhase.PhaseName)
      : undefined,
    phaseNumber: pa.EngPremisesAddress?.EngEstate?.EngPhase?.PhaseNo,
    estateName: titleCase(pa.EngPremisesAddress?.EngEstate?.EstateName),
    streetName: titleCase(pa.EngPremisesAddress?.EngStreet?.StreetName),
    neighbourhood: neighbourhood
      ? neighbourhood
      : pa.EngPremisesAddress?.EngStreet?.EngVillage?.LocationName
        ? getFirstLocation(pa.EngPremisesAddress?.EngStreet?.EngVillage?.LocationName)
        : undefined,
    district: getNormalisedDistrict(
      pa.EngPremisesAddress?.EngDistrict?.DcDistrict,
      'en',
    ),
    region: getNormalisedRegion(pa.EngPremisesAddress?.Region, 'en'),
    country: getNormalisedCountry('Hong Kong', 'en'),
  }

  const addressMeta: AddressMeta = {
    geoAddressCode: pa.GeoAddress,
    distanceFromPoint: calculateDistance(
      lng,
      lat,
      parseFloat(pa.GeospatialInformation.Longitude),
      parseFloat(pa.GeospatialInformation.Latitude),
    ),
    longitude: parseFloat(pa.GeospatialInformation.Longitude),
    latitude: parseFloat(pa.GeospatialInformation.Latitude),
    confidenceForwardGeocoder: address.ValidationInformation.Score,
    addressForwardGeocoder: 'hkgov_als',
    addressForwardGen: true,
  }

  return {
    addressMeta: Object.fromEntries(
      Object.entries(addressMeta).filter(([_, value]) => value !== undefined),
    ),
    i18n: {
      en: {
        displayAddress: displayAddressEn,
        displayAddressGen: genDisplayAddress,
        addressProperties: Object.fromEntries(
          Object.entries(addressPropertiesEn).filter(
            ([_, value]) => value !== undefined,
          ),
        ),
      },
      'zh-hant': {
        displayAddress: displayAddressZhHant,
        displayAddressGen: genDisplayAddress,
        addressProperties: Object.fromEntries(
          Object.entries(addressPropsZhHant).filter(
            ([_, value]) => value !== undefined,
          ),
        ),
      },
      'zh-hans': {
        displayAddress: displayAddressZhHans,
        displayAddressGen: genDisplayAddress,
        addressProperties: Object.fromEntries(
          Object.entries(addressPropsZhHans).filter(
            ([_, value]) => value !== undefined,
          ),
        ),
      },
    },
  }
}

function parseALSResultToDisplay(
  address: ALSSuggestedAddressItem,
  neighbourhood: string | null,
  locale: Exclude<Locale, 'zh-hans'> = 'en',
) {
  const pa = address.Address.PremisesAddress

  if (locale === 'en') {
    const { EngPremisesAddress: eng } = pa
    const parts = []

    // Building/Block info
    if (eng.BuildingName) {
      parts.push(eng.BuildingName)
    }
    if (eng.EngBlock) {
      const blockPart =
        eng.EngBlock.BlockDescriptorPrecedenceIndicator === 'Y'
          ? `${eng.EngBlock.BlockDescriptor} ${eng.EngBlock.BlockNo}`
          : `${eng.EngBlock.BlockNo} ${eng.EngBlock.BlockDescriptor}`
      parts.push(blockPart)
    }

    // Estate/Phase info
    if (eng.EngEstate) {
      let estatePart = eng.EngEstate.EstateName
      if (eng.EngEstate.EngPhase?.PhaseNo) {
        estatePart = `${estatePart} PH ${eng.EngEstate.EngPhase.PhaseNo}`
      }
      parts.push(estatePart)
    }

    // Street address
    if (eng.EngStreet) {
      let streetAddress = ''
      if (eng.EngStreet.BuildingNoFrom) {
        streetAddress = eng.EngStreet.BuildingNoFrom
      }
      if (eng.EngStreet.BuildingNoTo) {
        streetAddress = `${streetAddress}-${eng.EngStreet.BuildingNoTo}`
      }
      streetAddress = `${streetAddress} ${eng.EngStreet.StreetName}`
      parts.push(streetAddress)
    }

    // Area info
    if (neighbourhood) {
      parts.push(neighbourhood)
    } else {
      const districtKey = getNormalisedDistrict(eng.EngDistrict.DcDistrict, 'en')
      const districtNameFromCode = districtKey
        ? districtCodeToName[districtKey as keyof typeof districtCodeToName]
        : undefined
      const location = eng.EngStreet?.EngVillage?.LocationName || districtNameFromCode
      if (location) {
        parts.push(location)
      }
    }

    return removeRegion(titleCase(applyAddressAbbreviations(parts.join(', '))))
  } else {
    if (!('ChiPremisesAddress' in pa)) return null
    const { ChiPremisesAddress: chi } = pa
    const parts = []

    // Area info
    const location = chi.ChiDistrict.DcDistrict
    if (location) {
      parts.push(location)
    }

    // Street address
    if (chi.ChiStreet) {
      parts.push(chi.ChiStreet.StreetName)
      if (chi.ChiStreet.BuildingNoFrom) {
        let numberRange = chi.ChiStreet.BuildingNoFrom
        if (chi.ChiStreet.BuildingNoTo) {
          numberRange = `${chi.ChiStreet.BuildingNoFrom}-${chi.ChiStreet.BuildingNoTo}`
        }
        parts.push(numberRange + '號')
      }
    }

    // Estate/Phase info
    if (chi.ChiEstate) {
      let estatePart = chi.ChiEstate.EstateName
      if (chi.ChiEstate.ChiPhase?.PhaseNo) {
        estatePart = `${estatePart}第${chi.ChiEstate.ChiPhase.PhaseNo}期`
      }
      parts.push(estatePart)
    }

    // Building/Block info
    if (chi.BuildingName) {
      parts.push(chi.BuildingName)
    }
    if (chi.ChiBlock) {
      parts.push(`${chi.ChiBlock.BlockNo}${chi.ChiBlock.BlockDescriptor}`)
    }

    // Skip adding region to avoid regional suffixes
    // parts.push(chi.Region);

    return parts.join('')
  }
}

/************
 * ORCHESTRATION
 ************/

/**
 * Reverse geocode - take a point and return an address
 * @param lng - The longitude of the point to reverse geocode
 * @param lat - The latitude of the point to reverse geocode
 * @returns The reverse geocoding result, or null if the request fails
 */
export async function reverseGeocode(
  lng: number,
  lat: number,
): Promise<ParsedReverseGeocodeResult | null> {
  const result = await fetchReverseGeocodeResult(lng, lat)
  if (!result) {
    return null
  }

  // Parse the response into our canonical format
  const processedResult = processReverseGeocodeResult(result, lng, lat)

  if (!processedResult) {
    return null
  }

  // Perform forward lookup using the Match_addr
  try {
    // Use English address properties to perform forward geocoding
    const addressProperties = processedResult?.i18n.en.addressProperties
    const streetAddress = `${addressProperties?.buildingNumberFrom} ${addressProperties?.streetName}`

    const forwardResult = await fetchForwardGeocodeALSResult(
      streetAddress,
      addressProperties?.neighbourhood,
    )

    if (forwardResult) {
      const fullResult = await processForwardGeocodeResult(
        forwardResult,
        addressProperties?.neighbourhood,
        true,
        lng,
        lat,
      )
      if (fullResult) {
        // Merge the results, keeping reverse geocode specific fields
        const mergedResult = {
          ...fullResult,
          addressMeta: {
            ...fullResult.addressMeta,
            distanceFromPoint: processedResult?.addressMeta?.distanceFromPoint,
            addressReverseGeocoder:
              processedResult?.addressMeta?.addressReverseGeocoder,
            addressReverseGen: processedResult?.addressMeta?.addressReverseGen,
          },
          // The reverse geocoder result is cleaner than the forward geocoder result
          i18n: {
            ...fullResult.i18n,
            en: {
              ...fullResult.i18n.en,
              displayAddress: processedResult?.i18n?.en?.displayAddress,
            },
          },
        }
        return mergedResult
      }
    }
  } catch (error) {
    console.error('Forward geocoding failed:', error)
  }

  return processedResult
}
