import Coordinates from 'coordinate-parser'

export type ImageMetadataMap = Record<string, string>

export type ImageMetadataCoordinates = {
  latitude?: string
  longitude?: string
}

const capitalizeFirstLetter = (value: string | null | undefined): string =>
  value && value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : ''

const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/gu, ' ').trim()

const normalizeBrand = (value: string): string =>
  normalizeWhitespace(
    value
      .replace(
        /\b(corporation|corp\.?|company,?\s+ltd\.?|company|inc\.?|co\.?,?\s*ltd\.?)\b/giu,
        '',
      )
      .replace(/\s+/gu, ' '),
  )

const toTitleCaseIfAllCaps = (value: string): string =>
  value === value.toUpperCase()
    ? value.toLowerCase().replace(/\b\p{L}/gu, match => match.toUpperCase())
    : value

const parseExifDate = (dateStr: string): string => {
  const normalized = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/u, '$1-$2-$3')
  return new Date(normalized).toISOString()
}

/**
 * Converts GPS metadata into latitude/longitude strings when possible.
 */
export function getCoordinatesFromMetadata(
  metadata: ImageMetadataMap,
): ImageMetadataCoordinates {
  try {
    const coordinates = new Coordinates(
      `${metadata.GPSLatitude.replace(' deg', '°')} ${metadata.GPSLongitude.replace(' deg', '°')}`,
    )
    return {
      latitude: coordinates.getLatitude().toString(),
      longitude: coordinates.getLongitude().toString(),
    }
  } catch {
    if (metadata.GPSLatitude && metadata.GPSLongitude) {
      return {
        latitude: String(metadata.GPSLatitude),
        longitude: String(metadata.GPSLongitude),
      }
    }
    return { latitude: undefined, longitude: undefined }
  }
}

/**
 * Extracts the capture date from EXIF-style metadata.
 */
export function getCapturedAtFromMetadata(metadata: ImageMetadataMap): string {
  const possibleFields = ['DateTimeOriginal', 'CreateDate', 'ModifyDate']
  for (const field of possibleFields) {
    if (metadata[field]) {
      try {
        return parseExifDate(metadata[field])
      } catch {}
    }
  }

  if (metadata.DateCreated && metadata.TimeCreated) {
    try {
      return parseExifDate(`${metadata.DateCreated} ${metadata.TimeCreated}`)
    } catch {
      return new Date().toISOString()
    }
  }

  return new Date().toISOString()
}

/**
 * Extracts a normalized camera make/model string from EXIF-style metadata.
 */
export function getCameraFromMetadata(metadata: ImageMetadataMap): string | undefined {
  const rawMake = normalizeWhitespace(metadata.Make ?? '')
  const rawModel = normalizeWhitespace(metadata.Model ?? '')
  if (!rawMake && !rawModel) return undefined

  const make = toTitleCaseIfAllCaps(normalizeBrand(capitalizeFirstLetter(rawMake)))
  const model = rawModel
  const lowerMake = make.toLowerCase()
  const lowerModel = model.toLowerCase()

  if (!make) return model || undefined
  if (!model) return make || undefined
  if (lowerModel.includes(lowerMake)) return model.trim() || undefined

  const firstModelToken = lowerModel.split(/\s+/u)[0] ?? ''
  const firstMakeToken = lowerMake.split(/\s+/u)[0] ?? ''
  if (firstMakeToken && firstMakeToken === firstModelToken) {
    return model.trim() || undefined
  }

  return `${make} ${model}`.trim() || undefined
}

/**
 * Extracts credit or copyright attribution from EXIF-style metadata.
 */
export function getCreditFromMetadata(metadata: ImageMetadataMap): string | undefined {
  const possibleFields = ['CopyrightNotice', 'Credit', 'By-line', 'Copyright', 'Artist']
  for (const field of possibleFields) {
    if (metadata[field]) {
      return metadata[field]
    }
  }
  return undefined
}
