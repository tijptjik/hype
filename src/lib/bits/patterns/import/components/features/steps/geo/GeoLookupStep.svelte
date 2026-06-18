<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// BITS COMPONENTS
import Badge from '$lib/bits/custom/badge/Badge.svelte'
// CONTEXT
import { getImportCtx } from '$lib/context/import.svelte'
// SERVICES
import {
  fetchALSResultFromAddress,
  processForwardGeocodeResult,
} from '$lib/api/external/geocoding'
import { getAddressForQuery, toLocalParseResult } from '$lib/utils/geocoding'
// TYPES
import type { GeoLookupStatusCounts } from '$lib/client/services/import/features'
import type { ALSResult, LocaleKey } from '$lib/types'

type Props = {
  startProcessing?: () => void
  clearCacheAction?: () => void
  pauseAction?: () => void
  footerStatus?: string
  isBusy?: boolean
  isPaused?: boolean
  statusCounts?: GeoLookupStatusCounts
}

let {
  startProcessing = $bindable(),
  clearCacheAction = $bindable(),
  pauseAction = $bindable(),
  footerStatus = $bindable(),
  isBusy = $bindable(),
  isPaused: isPausedProp = $bindable(false),
  statusCounts = $bindable(),
}: Props = $props()

const importCtx = getImportCtx()

// Geocoding state
let isGeocoding = $state(false)
let isPaused = $state(false)
let autoProgress = $state(true) // New state for auto-progress mode
let currentRow = $state(0)
let totalRows = $state(0)
let geocodingProgress = $state({
  completed: 0,
  total: 0,
  errors: 0,
  withApiResult: 0,
  withoutApiResult: 0,
})
let processingScenarios = $state<{ scenario: 1 | 2 | 3; count: number }[]>([])
let sampledRowIndices = $state<number[]>([])
let geocodeCacheSize = $state(0)
let isLoadingCache = $state(true)

const GEO_LOOKUP_CACHE_KEY = 'hype.import.geo-lookup-cache.v1'

// Dashboard state for current row being processed
let currentRowData = $state<{
  originalRowIndex: number
  existing: {
    rawAddress?: string
    displayAddress?: string
    latitude?: number
    longitude?: number
    structuredAddress?: Record<string, any>
  }
  processed?: {
    latitude?: number
    longitude?: number
    displayAddress?: Record<string, string>
    addressProperties?: Record<string, any>
    addressMeta?: Record<string, any>
  }
} | null>(null)

// Structured address state
let structuredAddressStats = $state<{
  withStructuredAddress: number
  withoutStructuredAddress: number
  total: number
}>({ withStructuredAddress: 0, withoutStructuredAddress: 0, total: 0 })
let overrideStructuredAddresses = $state(false)

// Get address columns (both displayAddress and rawAddress)
let addressColumns = $derived.by(() => {
  const columns = importCtx
    .getColumns()
    .filter(
      col =>
        col.modelType === 'Feature' &&
        (col.field === 'displayAddress' || col.field === 'rawAddress'),
    )
  return columns
})

// Get structured Address model columns
let structuredAddressColumns = $derived.by(() => {
  const columns = importCtx.getColumns().filter(col => col.modelType === 'Address')
  return columns
})

// Get AddressMeta columns
let addressMetaColumns = $derived.by(() => {
  const columns = importCtx.getColumns().filter(col => col.modelType === 'AddressMeta')
  return columns
})

// Get coordinate columns
let coordinateColumns = $derived.by(() => {
  const latColumns = importCtx
    .getColumns()
    .filter(col => col.modelType === 'Feature' && col.field === 'latitude')
  const lngColumns = importCtx
    .getColumns()
    .filter(col => col.modelType === 'Feature' && col.field === 'longitude')

  return { latitude: latColumns, longitude: lngColumns }
})

onMount(() => {
  refreshGeocodeCacheSize()
  analyzeGeocodingNeeds()
  isLoadingCache = false
})

function getGeocodeCache(): Record<string, ALSResult> {
  if (typeof localStorage === 'undefined') return {}

  try {
    const raw = localStorage.getItem(GEO_LOOKUP_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    console.warn('🗺️ GeoLookupStep: Failed to read geo lookup cache:', error)
    return {}
  }
}

function setGeocodeCache(cache: Record<string, ALSResult>) {
  if (typeof localStorage === 'undefined') return

  localStorage.setItem(GEO_LOOKUP_CACHE_KEY, JSON.stringify(cache))
  refreshGeocodeCacheSize()
}

function refreshGeocodeCacheSize() {
  geocodeCacheSize = Object.keys(getGeocodeCache()).length
}

function toGeocodeCacheKey(
  address: string,
  locale: LocaleKey,
  floor: string | null = null,
  unit: string | null = null,
): string {
  return JSON.stringify({
    address: address.trim(),
    locale,
    floor: floor?.trim() || null,
    unit: unit?.trim() || null,
  })
}

function clearGeocodeCache() {
  if (typeof localStorage === 'undefined') return

  localStorage.removeItem(GEO_LOOKUP_CACHE_KEY)
  refreshGeocodeCacheSize()
}

function analyzeStructuredAddressCoverage() {
  const data = importCtx.getData()
  const headers = importCtx.getHeaders()

  if (structuredAddressColumns.length === 0) {
    // No structured address columns, all rows need geocoding
    structuredAddressStats = {
      withStructuredAddress: 0,
      withoutStructuredAddress: data.length,
      total: data.length,
    }
    return
  }

  // Create a map of address column indices by locale
  const structuredAddressIndicesByLocale = new Map<string, number[]>()
  structuredAddressColumns.forEach(col => {
    const columnIndex = headers.findIndex(h => h === col.header)
    if (columnIndex !== -1 && col.locale) {
      const locale = col.locale
      if (!structuredAddressIndicesByLocale.has(locale)) {
        structuredAddressIndicesByLocale.set(locale, [])
      }
      structuredAddressIndicesByLocale.get(locale)!.push(columnIndex)
    }
  })

  let rowsWithStructuredAddress = 0

  // Check each row to see if it has at least one structured address field in any locale
  data.forEach((row, index) => {
    let hasStructuredAddress = false

    // Check if any locale has at least one non-empty address field
    for (const [locale, columnIndices] of structuredAddressIndicesByLocale.entries()) {
      const hasAnyFieldInLocale = columnIndices.some(colIndex => {
        const value = row[colIndex]?.trim()
        return value && value.length > 0
      })

      if (hasAnyFieldInLocale) {
        hasStructuredAddress = true
        break
      }
    }

    if (hasStructuredAddress) {
      rowsWithStructuredAddress++
    }
  })

  structuredAddressStats = {
    withStructuredAddress: rowsWithStructuredAddress,
    withoutStructuredAddress: data.length - rowsWithStructuredAddress,
    total: data.length,
  }
}

function analyzeGeocodingNeeds() {
  // First analyze structured address coverage
  analyzeStructuredAddressCoverage()

  const data = importCtx.getData()
  const headers = importCtx.getHeaders()

  // Create maps for address and coordinate columns
  // Separate rawAddress and displayAddress columns
  const rawAddressColumns = addressColumns.filter(col => col.field === 'rawAddress')
  const displayAddressColumns = addressColumns.filter(
    col => col.field === 'displayAddress',
  )

  const rawAddressLocaleToColumnIndex = new Map<LocaleKey, number>()
  const displayAddressLocaleToColumnIndex = new Map<LocaleKey, number>()

  rawAddressColumns.forEach(col => {
    const columnIndex = headers.findIndex(h => h === col.header)
    if (columnIndex !== -1 && col.locale) {
      rawAddressLocaleToColumnIndex.set(col.locale as LocaleKey, columnIndex)
    }
  })

  displayAddressColumns.forEach(col => {
    const columnIndex = headers.findIndex(h => h === col.header)
    if (columnIndex !== -1 && col.locale) {
      displayAddressLocaleToColumnIndex.set(col.locale as LocaleKey, columnIndex)
    }
  })

  const latColumnIndex =
    coordinateColumns.latitude.length > 0
      ? headers.findIndex(h => h === coordinateColumns.latitude[0].header)
      : -1
  const lngColumnIndex =
    coordinateColumns.longitude.length > 0
      ? headers.findIndex(h => h === coordinateColumns.longitude[0].header)
      : -1

  // Categorize all rows by scenario
  const scenario1Rows: number[] = [] // English address available
  const scenario2Rows: number[] = [] // Chinese address available (no English)
  const scenario3Rows: number[] = [] // Coordinates available (no address)
  const unknownLocationRows: number[] = []

  // Helper function to get address for a locale with prioritization
  function getAddressForLocale(row: string[], locale: LocaleKey): string | null {
    // Priority: If both rawAddress and displayAddress exist, use displayAddress for lookup
    // but store rawAddress separately
    if (displayAddressLocaleToColumnIndex.has(locale)) {
      const displayValue = row[displayAddressLocaleToColumnIndex.get(locale)!]?.trim()
      if (displayValue) return displayValue
    }

    // Fallback to rawAddress if no displayAddress
    if (rawAddressLocaleToColumnIndex.has(locale)) {
      const rawValue = row[rawAddressLocaleToColumnIndex.get(locale)!]?.trim()
      if (rawValue) return rawValue
    }

    return null
  }

  data.forEach((row, index) => {
    const hasEnglishAddress = getAddressForLocale(row, 'en') !== null
    const hasChineseAddress =
      getAddressForLocale(row, 'zhHant') !== null ||
      getAddressForLocale(row, 'zhHans') !== null
    const hasCoordinates =
      latColumnIndex !== -1 &&
      lngColumnIndex !== -1 &&
      row[latColumnIndex]?.trim() &&
      row[lngColumnIndex]?.trim()

    if (hasEnglishAddress) {
      scenario1Rows.push(index)
    } else if (hasChineseAddress) {
      scenario2Rows.push(index)
    } else if (hasCoordinates) {
      scenario3Rows.push(index)
    } else {
      unknownLocationRows.push(index + 2) // +2 for header row and 1-based indexing
    }
  })

  // Process all rows instead of sampling
  const sampledScenario1 = [...scenario1Rows] // Process all scenario 1 rows
  const sampledScenario2 = [...scenario2Rows] // Process all scenario 2 rows

  // Store all row indices for processing
  sampledRowIndices = [...sampledScenario1, ...sampledScenario2]
  totalRows = sampledRowIndices.length

  processingScenarios = [
    { scenario: 1, count: sampledScenario1.length },
    { scenario: 2, count: sampledScenario2.length },
    { scenario: 3, count: scenario3Rows.length },
  ]

  geocodingProgress = {
    completed: 0,
    total: sampledScenario1.length + sampledScenario2.length, // Scenario 3 is skipped
    errors: 0,
    withApiResult: 0,
    withoutApiResult: 0,
  }

  if (unknownLocationRows.length > 0) {
    console.error('🗺️ GeoLookupStep: Rows with unknown location:', unknownLocationRows)
    // This should have been caught in step 1 validation
  }
}

// Helper function to get random sample from array
function getRandomSample<T>(array: T[], sampleSize: number): T[] {
  if (array.length <= sampleSize) {
    return [...array] // Return all if array is smaller than sample size
  }

  const shuffled = [...array].sort(() => 0.5 - Math.random())
  return shuffled.slice(0, sampleSize)
}

// Helper function to prepare existing row data for dashboard
function prepareExistingRowData(
  row: string[],
  originalRowIndex: number,
  headers: string[],
) {
  const data = importCtx.getData()

  // Get existing coordinates
  const latColumnIndex =
    coordinateColumns.latitude.length > 0
      ? headers.findIndex(h => h === coordinateColumns.latitude[0].header)
      : -1
  const lngColumnIndex =
    coordinateColumns.longitude.length > 0
      ? headers.findIndex(h => h === coordinateColumns.longitude[0].header)
      : -1

  let latitude =
    latColumnIndex !== -1 ? parseFloat(row[latColumnIndex]?.trim()) : undefined
  let longitude =
    lngColumnIndex !== -1 ? parseFloat(row[lngColumnIndex]?.trim()) : undefined

  // Validate and potentially correct swapped coordinates
  if (
    latitude !== undefined &&
    longitude !== undefined &&
    !isNaN(latitude) &&
    !isNaN(longitude)
  ) {
    // Check if coordinates might be swapped (common data error)
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      console.warn(
        `🚨 [extractRowCoordinates] Invalid coordinate ranges: longitude=${longitude}, latitude=${latitude}`,
      )
    } else if (
      Math.abs(longitude) <= 90 &&
      Math.abs(latitude) <= 180 &&
      Math.abs(longitude) < Math.abs(latitude)
    ) {
      console.warn(
        `⚠️ [extractRowCoordinates] Coordinates appear to be swapped: longitude=${longitude}, latitude=${latitude}. ` +
          `Auto-correcting for Hong Kong data (expected: ~114°E, ~22°N)`,
      )

      // Auto-correct the swapped coordinates
      const correctedLatitude = longitude
      const correctedLongitude = latitude

      latitude = correctedLatitude
      longitude = correctedLongitude
    }
  }

  // Get existing addresses
  const rawAddressColumns = addressColumns.filter(col => col.field === 'rawAddress')
  const displayAddressColumns = addressColumns.filter(
    col => col.field === 'displayAddress',
  )

  let rawAddress: string | undefined
  let displayAddress: string | undefined

  // Get first available raw and display addresses
  for (const col of rawAddressColumns) {
    const colIndex = headers.findIndex(h => h === col.header)
    if (colIndex !== -1 && row[colIndex]?.trim()) {
      rawAddress = row[colIndex].trim()
      break
    }
  }

  for (const col of displayAddressColumns) {
    const colIndex = headers.findIndex(h => h === col.header)
    if (colIndex !== -1 && row[colIndex]?.trim()) {
      displayAddress = row[colIndex].trim()
      break
    }
  }

  // Get structured address data if available
  const structuredAddress: Record<string, any> = {}
  structuredAddressColumns.forEach(col => {
    const colIndex = headers.findIndex(h => h === col.header)
    if (colIndex !== -1 && row[colIndex]?.trim()) {
      const key = `${col.field}_${col.locale || 'unknown'}`
      structuredAddress[key] = row[colIndex].trim()
    }
  })

  return {
    rawAddress,
    displayAddress,
    latitude: !isNaN(latitude!) ? latitude : undefined,
    longitude: !isNaN(longitude!) ? longitude : undefined,
    structuredAddress:
      Object.keys(structuredAddress).length > 0 ? structuredAddress : undefined,
  }
}

// Modified handleGeocode for CSV processing
async function handleGeocodeForCSV(
  rawAddress: string,
  locale: LocaleKey,
): Promise<{
  processedResult: Awaited<ReturnType<typeof processForwardGeocodeResult>> | null
  fromCache: boolean
}> {
  try {
    // Parse address components using new structured function
    const addressComponents = getAddressForQuery(rawAddress, locale)

    // Geocode using the optimized query address (includes disambiguation if needed)
    if (addressComponents.queryAddress) {
      const cacheKey = toGeocodeCacheKey(
        addressComponents.queryAddress,
        locale,
        null,
        null,
      )
      const cache = getGeocodeCache()
      const cachedResult = cache[cacheKey]
      const result =
        cachedResult ??
        (await fetchALSResultFromAddress(addressComponents.queryAddress))

      if (!cachedResult) {
        cache[cacheKey] = result
        setGeocodeCache(cache)
      }

      if (!result) {
        throw new Error('No geocoding result found')
      }

      // Process the result
      // Note: subPremises parsing will be added in future enhancement
      const processedResult = await processForwardGeocodeResult(
        result,
        addressComponents.neighbourhood,
        true,
        0, // placeholder longitude for distance calculation
        0, // placeholder latitude for distance calculation
        addressComponents.subpremisesRaw,
        rawAddress,
      )

      if (!processedResult) {
        throw new Error('Failed to process geocoding result')
      }

      return {
        processedResult,
        fromCache: Boolean(cachedResult),
      }
    } else {
      return {
        processedResult: toLocalParseResult(addressComponents),
        fromCache: true,
      }
    }
  } catch (error) {
    console.error('🗺️ GeoLookupStep: Geocoding error:', error)
    return {
      processedResult: null,
      fromCache: false,
    }
  }
}

async function startGeocoding() {
  if (isGeocoding) return
  isGeocoding = true
  isPaused = false
  geocodingProgress = {
    completed: 0,
    total: geocodingProgress.total,
    errors: 0,
    withApiResult: 0,
    withoutApiResult: 0,
  }

  const data = importCtx.getData()
  const headers = importCtx.getHeaders()

  // Create maps for address columns with prioritization support
  const rawAddressLocaleToColumnIndex = new Map<LocaleKey, number>()
  const displayAddressLocaleToColumnIndex = new Map<LocaleKey, number>()

  const rawAddressColumns = addressColumns.filter(col => col.field === 'rawAddress')
  const displayAddressColumns = addressColumns.filter(
    col => col.field === 'displayAddress',
  )

  rawAddressColumns.forEach(col => {
    const columnIndex = headers.findIndex(h => h === col.header)
    if (columnIndex !== -1 && col.locale) {
      rawAddressLocaleToColumnIndex.set(col.locale as LocaleKey, columnIndex)
    }
  })

  displayAddressColumns.forEach(col => {
    const columnIndex = headers.findIndex(h => h === col.header)
    if (columnIndex !== -1 && col.locale) {
      displayAddressLocaleToColumnIndex.set(col.locale as LocaleKey, columnIndex)
    }
  })

  // Helper function for address prioritization in geocoding
  function getAddressForGeocodingWithMeta(
    row: string[],
    locale: LocaleKey,
  ): {
    addressForGeocoding: string | null
    rawAddressValue: string | null
    displayAddressValue: string | null
  } {
    const rawAddressValue = rawAddressLocaleToColumnIndex.has(locale)
      ? row[rawAddressLocaleToColumnIndex.get(locale)!]?.trim() || null
      : null
    const displayAddressValue = displayAddressLocaleToColumnIndex.has(locale)
      ? row[displayAddressLocaleToColumnIndex.get(locale)!]?.trim() || null
      : null

    // Prioritization logic:
    // - If both exist: use displayAddress for geocoding, don't override it
    // - If only rawAddress: use it for geocoding, generate displayAddress
    // - If only displayAddress: use it for geocoding, don't override it
    let addressForGeocoding = null
    if (displayAddressValue) {
      addressForGeocoding = displayAddressValue
    } else if (rawAddressValue) {
      addressForGeocoding = rawAddressValue
    }

    return { addressForGeocoding, rawAddressValue, displayAddressValue }
  }

  const latColumnIndex =
    coordinateColumns.latitude.length > 0
      ? headers.findIndex(h => h === coordinateColumns.latitude[0].header)
      : -1
  const lngColumnIndex =
    coordinateColumns.longitude.length > 0
      ? headers.findIndex(h => h === coordinateColumns.longitude[0].header)
      : -1

  for (let i = 0; i < sampledRowIndices.length; i++) {
    // Check for pause
    while (isPaused && isGeocoding) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Check if geocoding was stopped while paused
    if (!isGeocoding) {
      break
    }

    const originalRowIndex = sampledRowIndices[i]
    currentRow = i + 1
    const row = data[originalRowIndex]

    // Auto-pause after each row (except the first one) if auto-progress is disabled
    if (i > 0 && !autoProgress) {
      isPaused = true
    }

    // Prepare existing data for dashboard
    const existingData = prepareExistingRowData(row, originalRowIndex, headers)
    currentRowData = {
      originalRowIndex,
      existing: existingData,
      processed: undefined,
    }

    try {
      // Determine scenario and get address with prioritization
      let addressForGeocoding: string | null = null
      let rawAddressValue: string | null = null
      let displayAddressValue: string | null = null
      let locale: LocaleKey = 'en'
      let usedApiLookup = false

      // Scenario 1: English address available
      const englishAddressData = getAddressForGeocodingWithMeta(row, 'en')
      if (englishAddressData.addressForGeocoding) {
        addressForGeocoding = englishAddressData.addressForGeocoding
        rawAddressValue = englishAddressData.rawAddressValue
        displayAddressValue = englishAddressData.displayAddressValue
        locale = 'en'
      }
      // Scenario 2: Chinese address available (no English)
      else {
        const chineseTraditionalData = getAddressForGeocodingWithMeta(row, 'zhHant')
        const chineseSimplifiedData = getAddressForGeocodingWithMeta(row, 'zhHans')

        if (chineseTraditionalData.addressForGeocoding) {
          addressForGeocoding = chineseTraditionalData.addressForGeocoding
          rawAddressValue = chineseTraditionalData.rawAddressValue
          displayAddressValue = chineseTraditionalData.displayAddressValue
          locale = 'zhHant'
        } else if (chineseSimplifiedData.addressForGeocoding) {
          addressForGeocoding = chineseSimplifiedData.addressForGeocoding
          rawAddressValue = chineseSimplifiedData.rawAddressValue
          displayAddressValue = chineseSimplifiedData.displayAddressValue
          locale = 'zhHans'
        }
      }
      // Note: Scenario 3 (coordinates) are not included in sampling for geocoding

      // TODO: Implement scenario 3

      // Process address if available
      if (addressForGeocoding) {
        const { processedResult: geocodingResult, fromCache } =
          await handleGeocodeForCSV(addressForGeocoding, locale)
        usedApiLookup = !fromCache

        if (geocodingResult) {
          // Check if result came from API (has valid addressForwardGeocoder, not "invalid")
          const forwardGeocoder = (geocodingResult.addressMeta as any)
            ?.addressForwardGeocoder
          const hasApiResult = forwardGeocoder && forwardGeocoder !== 'invalid'

          // Store enriched data for the original row index
          const existingData = importCtx.getRowEnrichedData(originalRowIndex) || {}

          // Store raw coordinates if they exist in CSV
          let rawLatitude =
            latColumnIndex !== -1 ? parseFloat(row[latColumnIndex]?.trim()) : undefined
          let rawLongitude =
            lngColumnIndex !== -1 ? parseFloat(row[lngColumnIndex]?.trim()) : undefined

          // Validate and potentially correct swapped coordinates
          if (
            rawLatitude !== undefined &&
            rawLongitude !== undefined &&
            !isNaN(rawLatitude) &&
            !isNaN(rawLongitude)
          ) {
            // Check if coordinates might be swapped (common data error)
            // Longitude should be -180 to 180, Latitude should be -90 to 90
            // Hong Kong: ~114°E, ~22°N
            if (Math.abs(rawLatitude) > 90 || Math.abs(rawLongitude) > 180) {
              console.warn(
                `🚨 [GeoLookupStep] Invalid coordinate ranges detected in row ${originalRowIndex + 1}: rawLongitude=${rawLongitude}, rawLatitude=${rawLatitude}`,
              )
            } else if (
              Math.abs(rawLongitude) <= 90 &&
              Math.abs(rawLatitude) <= 180 &&
              Math.abs(rawLongitude) < Math.abs(rawLatitude)
            ) {
              console.warn(
                `⚠️ [GeoLookupStep] Coordinates appear to be swapped in row ${originalRowIndex + 1}: rawLongitude=${rawLongitude}, rawLatitude=${rawLatitude}. ` +
                  `Auto-correcting for Hong Kong data (expected: ~114°E, ~22°N)`,
              )

              // Auto-correct the swapped coordinates
              const correctedLatitude = rawLongitude
              const correctedLongitude = rawLatitude

              rawLatitude = correctedLatitude
              rawLongitude = correctedLongitude
            }
          }

          // TODO: Store raw latitude/longitude in feature.addressMeta.rawLatitude and feature.addressMeta.rawLongitude
          // for later reconciliation when features are stored
          const enhancedAddressMeta = {
            ...geocodingResult.addressMeta,
            ...(rawLatitude !== undefined && !isNaN(rawLatitude) && { rawLatitude }),
            ...(rawLongitude !== undefined && !isNaN(rawLongitude) && { rawLongitude }),
          }

          const featureData = {
            addressMeta: enhancedAddressMeta,
            geometry: {
              coordinates: [
                (geocodingResult.addressMeta as any).longitude,
                (geocodingResult.addressMeta as any).latitude,
              ],
            },
            i18n: {} as Record<string, any>,
          }

          // Store i18n data for each locale with proper address handling
          Object.entries(geocodingResult.i18n).forEach(([geocodedLocale, data]) => {
            featureData.i18n[geocodedLocale] = {
              displayAddress: (data as any)?.displayAddress,
              displayAddressGen: (data as any)?.displayAddressGen,
              addressProperties: (data as any)?.addressProperties,
            }

            // Handle rawAddress storage - always store if it exists
            if (rawAddressValue && geocodedLocale === locale) {
              featureData.i18n[geocodedLocale].addressProperties = {
                ...featureData.i18n[geocodedLocale].addressProperties,
                rawAddress: rawAddressValue,
              }
            }

            // Handle displayAddress prioritization logic:
            // - If we have both rawAddress and displayAddress: keep existing displayAddress, don't override
            // - If only rawAddress: use generated displayAddress
            // - If only displayAddress: keep it as is (already handled above)
            if (displayAddressValue && geocodedLocale === locale) {
              // Don't override existing displayAddress
              featureData.i18n[geocodedLocale].displayAddress = displayAddressValue
              featureData.i18n[geocodedLocale].displayAddressGen = false // Mark as not generated
            }
          })

          const existingFeature =
            existingData.feature &&
            typeof existingData.feature === 'object' &&
            !Array.isArray(existingData.feature)
              ? existingData.feature
              : {}

          importCtx.setRowEnrichedData(originalRowIndex, {
            ...existingData,
            feature: {
              ...existingFeature,
              ...featureData,
            },
          })

          // Update dashboard with processed data
          if (currentRowData) {
            currentRowData.processed = {
              latitude: (geocodingResult.addressMeta as any).latitude,
              longitude: (geocodingResult.addressMeta as any).longitude,
              displayAddress: Object.fromEntries(
                Object.entries(geocodingResult.i18n)
                  .map(([locale, data]) => [locale, (data as any)?.displayAddress])
                  .filter(([_, address]) => address != null),
              ) as Record<string, string>,
              addressProperties: Object.fromEntries(
                Object.entries(geocodingResult.i18n).map(([locale, data]) => [
                  locale,
                  (data as any)?.addressProperties,
                ]),
              ),
              addressMeta: geocodingResult.addressMeta,
            }
          }

          geocodingProgress.completed++

          // Only count as matched if it has a valid geocoder result (not "invalid")
          if (hasApiResult) {
            geocodingProgress.withApiResult++
          } else {
            geocodingProgress.withoutApiResult++
          }
        } else {
          console.error(
            `🗺️ GeoLookupStep: Sample ${currentRow} (row ${originalRowIndex + 1}) geocoding failed`,
          )
          geocodingProgress.errors++
          geocodingProgress.withoutApiResult++
        }
      }

      // Rate limiting: only delay after actual ALS requests, not cache hits.
      if (i < sampledRowIndices.length - 1 && usedApiLookup) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    } catch (error) {
      console.error(
        `🗺️ GeoLookupStep: Error processing sample ${currentRow} (row ${originalRowIndex + 1}):`,
        error,
      )
      geocodingProgress.errors++
      geocodingProgress.withoutApiResult++
    }
  }

  isGeocoding = false

  // Auto-proceed to next step immediately after completion
  proceedToNextStep()
}

function togglePauseResume() {
  if (isPaused) {
    isPaused = false
    autoProgress = true // Enable auto-progress when resuming
  } else {
    isPaused = true
    autoProgress = false // Disable auto-progress
  }
}

function proceedToNextStep() {
  importCtx.updateFeatureResolution({ ignoreMissingFeatureIds: true })
  importCtx.setCurrentStep('feature-resolution') // Will be updated when next step is implemented
}

function skipGeocoding() {
  proceedToNextStep()
}

$effect(() => {
  startProcessing =
    addressColumns.length > 0 || coordinateColumns.latitude.length > 0
      ? startGeocoding
      : skipGeocoding
})

$effect(() => {
  clearCacheAction = clearGeocodeCache
})

$effect(() => {
  pauseAction = togglePauseResume
})

$effect(() => {
  isBusy = isLoadingCache || isGeocoding
})

$effect(() => {
  isPausedProp = isPaused
})

$effect(() => {
  statusCounts = {
    completed: geocodingProgress.completed,
    errors: geocodingProgress.errors,
    matched: geocodingProgress.withApiResult,
    noMatch: geocodingProgress.withoutApiResult,
    total: geocodingProgress.total,
    cacheSize: geocodeCacheSize,
    status: isLoadingCache
      ? 'loading'
      : isGeocoding
        ? isPaused
          ? 'paused'
          : 'processing'
        : geocodingProgress.completed + geocodingProgress.errors > 0
          ? 'complete'
          : 'ready',
  }
})

$effect(() => {
  if (isLoadingCache) {
    footerStatus = ''
    return
  }

  if (isGeocoding) {
    footerStatus = isPaused
      ? `Paused: ${geocodingProgress.completed + geocodingProgress.errors} / ${geocodingProgress.total}`
      : `Processing: ${geocodingProgress.completed + geocodingProgress.errors} / ${geocodingProgress.total}`
    return
  }

  footerStatus = ''
})
</script>

<div class="flex h-full flex-col">
  {#if addressColumns.length === 0 && coordinateColumns.latitude.length === 0}
    <!-- No Location Columns -->
    <div class="flex-1 p-4">
      <div class="alert alert-warning">
        <div>
          <h3 class="font-semibold">No Location Columns Found</h3>
          <p>
            No columns were mapped to addresses or coordinates. Geocoding step will be
            skipped.
          </p>
        </div>
      </div>
    </div>
  {:else}
    <!-- Main Content Area -->
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      {#if isGeocoding && currentRowData}
        <!-- Processing Dashboard - Two Column Layout -->
        <div class="flex min-h-0 flex-1 gap-4 overflow-hidden p-4">
          <!-- Left Panel - Existing Values -->
          <div
            class="flex flex-1 flex-col overflow-hidden rounded-3xl border border-info/25 bg-black/[0.45] p-5 shadow-[var(--shadow-mini)] backdrop-blur-xl"
          >
            <div class="mb-4 flex-none">
              <h5 class="text-sm font-semibold text-base-content/80">
                Original Data (Row {currentRowData.originalRowIndex + 1})
              </h5>
            </div>
            <div class="flex-1 space-y-4 overflow-y-auto">
              <!-- Coordinates -->
              <div>
                <div
                  class="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/60"
                >
                  Coordinates
                </div>
                <div class="font-mono text-sm">
                  {#if currentRowData.existing.latitude !== undefined && currentRowData.existing.longitude !== undefined}
                    <div class="ml-2">Lat: {currentRowData.existing.latitude}</div>
                    <div class="ml-2">Lng: {currentRowData.existing.longitude}</div>
                  {:else}
                    <div class="ml-2 text-base-content/50">No coordinates</div>
                  {/if}
                </div>
              </div>

              <!-- Addresses -->
              <div>
                <div
                  class="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/60"
                >
                  Addresses
                </div>
                <div class="space-y-2 font-mono text-sm">
                  {#if currentRowData.existing.rawAddress}
                    <div class="ml-2">
                      <div class="mb-1 font-medium text-base-content/80">Raw:</div>
                      <div class="ml-2 break-words text-base-content/70">
                        {currentRowData.existing.rawAddress}
                      </div>
                    </div>
                  {/if}
                  {#if currentRowData.existing.displayAddress}
                    <div class="ml-2">
                      <div class="mb-1 font-medium text-base-content/80">Display:</div>
                      <div class="ml-2 break-words text-base-content/70">
                        {currentRowData.existing.displayAddress}
                      </div>
                    </div>
                  {/if}
                  {#if !currentRowData.existing.rawAddress && !currentRowData.existing.displayAddress}
                    <div class="ml-2 text-base-content/50">No addresses</div>
                  {/if}
                </div>
              </div>

              <!-- Structured Address -->
              {#if currentRowData.existing.structuredAddress}
                <div>
                  <div
                    class="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/60"
                  >
                    Structured Address
                  </div>
                  <div class="space-y-2 font-mono text-sm">
                    {#each Object.entries(currentRowData.existing.structuredAddress) as [ key, value ]}
                      <div class="ml-2">
                        <div class="mb-1 font-medium text-base-content/80">{key}:</div>
                        <div class="ml-2 break-words text-base-content/70">{value}</div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          </div>

          <!-- Right Panel - Enriched Data -->
          <div
            class="flex flex-1 flex-col overflow-hidden rounded-3xl border border-success/25 bg-black/[0.45] p-5 shadow-[var(--shadow-mini)] backdrop-blur-xl"
          >
            <div class="mb-4 flex-none">
              <h5 class="text-sm font-semibold text-base-content/80">
                Enriched Data (API Result)
              </h5>
            </div>

            {#if currentRowData.processed}
              <div class="flex-1 space-y-4 overflow-y-auto">
                <!-- Coordinates -->
                <div>
                  <div
                    class="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/60"
                  >
                    Coordinates
                  </div>
                  <div class="font-mono text-sm">
                    <div class="ml-2">Lat: {currentRowData.processed.latitude}</div>
                    <div class="ml-2">Lng: {currentRowData.processed.longitude}</div>
                  </div>
                </div>

                <!-- Display Addresses -->
                <div>
                  <div
                    class="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/60"
                  >
                    Display Addresses
                  </div>
                  <div class="space-y-2 font-mono text-sm">
                    {#each Object.entries(currentRowData.processed.displayAddress || {}) as [ locale, address ]}
                      <div class="ml-2">
                        <div class="mb-1 font-medium text-base-content/80">
                          {locale}:
                        </div>
                        <div class="ml-2 break-words text-base-content/70">
                          {address}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>

                <!-- Address Properties -->
                <div>
                  <div
                    class="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/60"
                  >
                    Address Properties
                  </div>
                  <div class="space-y-3 font-mono text-sm">
                    {#each Object.entries(currentRowData.processed.addressProperties || {}) as [ locale, properties ]}
                      <div class="ml-2">
                        <div class="mb-1 font-medium text-base-content/80">
                          {locale}:
                        </div>
                        <div class="ml-2 space-y-2">
                          {#each Object.entries(properties || {}) as [ key, value ]}
                            <div>
                              <div class="mb-1 text-xs text-base-content/60">
                                {key}:
                              </div>
                              <div class="ml-2 break-words text-base-content/70">
                                {value}
                              </div>
                            </div>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>

                <!-- Address Meta -->
                {#if currentRowData.processed.addressMeta}
                  <div>
                    <div
                      class="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/60"
                    >
                      Address Meta
                    </div>
                    <div class="space-y-2 font-mono text-sm">
                      {#each Object.entries(currentRowData.processed.addressMeta) as [ key, value ]}
                        <div class="ml-2">
                          <div class="mb-1 text-xs text-base-content/60">{key}:</div>
                          <div class="ml-2 break-words text-base-content/70">
                            {value}
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {:else}
              <div class="flex flex-1 items-center justify-center">
                <div class="flex flex-col items-center gap-3">
                  <div class="loading loading-spinner loading-md text-primary"></div>
                  <div class="font-mono text-sm text-base-content/60">
                    Processing...
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </div>
      {:else}
        <!-- Pre-geocoding state -->
        <div class="flex flex-1 items-center p-4">
          <div class="grid w-full grid-cols-1 gap-4 lg:grid-cols-3">
            <section
              class="flex max-h-[420px] min-h-48 flex-col justify-between rounded-3xl border border-info/25 bg-black/[0.45] p-5 shadow-[var(--shadow-mini)] backdrop-blur-xl"
            >
              <div
                class="font-black text-7xl leading-none tracking-[-0.08em] text-info"
              >
                {addressColumns.length}
              </div>
              <div>
                <p
                  class="text-xs font-bold uppercase tracking-[0.22em] text-base-content/45"
                >
                  Address Columns
                </p>
                <div class="mt-4 flex flex-wrap gap-2">
                  {#if addressColumns.length > 0}
                    {#each addressColumns as col}
                      <Badge text={`${col.field} ${col.locale ?? ''}`} tone="neutral" />
                    {/each}
                  {:else}
                    <span class="text-sm text-base-content/50">None</span>
                  {/if}
                </div>
              </div>
            </section>

            <section
              class="flex max-h-[420px] min-h-48 flex-col justify-between rounded-3xl border border-warning/25 bg-black/[0.45] p-5 shadow-[var(--shadow-mini)] backdrop-blur-xl"
            >
              <div
                class="font-black text-7xl leading-none tracking-[-0.08em] text-warning"
              >
                {coordinateColumns.latitude.length + coordinateColumns.longitude.length}
              </div>
              <div>
                <p
                  class="text-xs font-bold uppercase tracking-[0.22em] text-base-content/45"
                >
                  Coordinate Columns
                </p>
                <div class="mt-4 flex flex-wrap gap-2">
                  {#if coordinateColumns.latitude.length > 0}
                    <Badge text="latitude" tone="neutral" />
                  {/if}
                  {#if coordinateColumns.longitude.length > 0}
                    <Badge text="longitude" tone="neutral" />
                  {/if}
                  {#if coordinateColumns.latitude.length === 0 && coordinateColumns.longitude.length === 0}
                    <span class="text-sm text-base-content/50">None</span>
                  {/if}
                </div>
              </div>
            </section>

            <section
              class="flex max-h-[420px] min-h-48 flex-col justify-between rounded-3xl border border-success/25 bg-black/[0.45] p-5 shadow-[var(--shadow-mini)] backdrop-blur-xl"
            >
              <div
                class="font-black text-7xl leading-none tracking-[-0.08em] text-success"
              >
                {geocodeCacheSize}
              </div>
              <div>
                <p
                  class="text-xs font-bold uppercase tracking-[0.22em] text-base-content/45"
                >
                  Cached Addresses
                </p>
                <p
                  class="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-base-content/55"
                >
                  {isLoadingCache ? 'Reading cache' : 'Ready'}
                </p>
              </div>
            </section>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
