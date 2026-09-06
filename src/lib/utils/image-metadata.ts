// THIRD-PARTY
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

/**
 * Parses an EXIF timestamp without silently rolling impossible dates forward.
 * @param dateStr EXIF or ISO timestamp.
 * @param offset Optional EXIF timezone offset for a timestamp without its own zone.
 * @returns ISO timestamp in UTC.
 */
const parseExifDate = (dateStr: string, offset?: string): string => {
  let normalized = dateStr.trim().replace(/^(\d{4}):(\d{2}):(\d{2})/u, '$1-$2-$3')
  const dateParts = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T]|$)/u)
  if (dateParts) {
    const [, year, month, day] = dateParts.map(Number)
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth) {
      throw new Error('Invalid EXIF calendar date')
    }
  }
  if (
    offset &&
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/u.test(normalized)
  ) {
    normalized = `${normalized.replace(' ', 'T')}${offset.trim()}`
  }
  return new Date(normalized).toISOString()
}

/**
 * Converts GPS metadata into latitude/longitude strings when possible.
 * @param metadata EXIF metadata, including optional hemisphere references.
 * @returns Valid signed coordinates, or undefined values when parsing fails.
 */
export function getCoordinatesFromMetadata(
  metadata: ImageMetadataMap,
): ImageMetadataCoordinates {
  try {
    const coordinates = new Coordinates(
      `${metadata.GPSLatitude.replace(' deg', '°')} ${metadata.GPSLongitude.replace(' deg', '°')}`,
    )
    let latitude = coordinates.getLatitude()
    let longitude = coordinates.getLongitude()
    // References may arrive after coordinate tags; normalize signs once all tags are read.
    const latitudeRef = metadata.GPSLatitudeRef?.trim().toUpperCase()
    const longitudeRef = metadata.GPSLongitudeRef?.trim().toUpperCase()
    if (latitudeRef === 'S') latitude = -Math.abs(latitude)
    if (latitudeRef === 'N') latitude = Math.abs(latitude)
    if (longitudeRef === 'W') longitude = -Math.abs(longitude)
    if (longitudeRef === 'E') longitude = Math.abs(longitude)
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180
    ) {
      return { latitude: String(latitude), longitude: String(longitude) }
    }
  } catch {}
  return { latitude: undefined, longitude: undefined }
}

/**
 * Extracts the capture date from EXIF-style metadata when one is explicitly present.
 * @param metadata EXIF metadata with capture dates and optional timezone offsets.
 * @returns The first valid capture timestamp in UTC, or undefined.
 */
export function getCapturedAtFromMetadata(
  metadata: ImageMetadataMap,
): string | undefined {
  const possibleFields = [
    ['DateTimeOriginal', 'OffsetTimeOriginal'],
    ['CreateDate', 'OffsetTimeDigitized'],
    ['ModifyDate', 'OffsetTime'],
  ] as const
  for (const [field, offsetField] of possibleFields) {
    if (metadata[field]) {
      try {
        return parseExifDate(metadata[field], metadata[offsetField])
      } catch {}
    }
  }

  if (metadata.DateCreated && metadata.TimeCreated) {
    try {
      return parseExifDate(`${metadata.DateCreated} ${metadata.TimeCreated}`)
    } catch {}
  }

  return undefined
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
