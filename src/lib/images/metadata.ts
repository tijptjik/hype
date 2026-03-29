// UTILS
import {
  getCameraFromMetadata,
  getCapturedAtFromMetadata,
  getCoordinatesFromMetadata,
  getCreditFromMetadata,
  type ImageMetadataMap,
} from '$lib/utils/image-metadata'

const JPEG_SOI_MARKER = 0xffd8
const JPEG_APP1_MARKER = 0xffe1
const JPEG_APP13_MARKER = 0xffed
const MAX_CLIENT_METADATA_PROBE_BYTES = 16 * 1024 * 1024
const EXIF_HEADER = 'Exif\0\0'
const XMP_HEADER = 'http://ns.adobe.com/xap/1.0/\0'
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const RIFF_HEADER = 'RIFF'
const WEBP_HEADER = 'WEBP'
const JXL_CONTAINER_BRAND = 'JXL '
const TIFF_BIG_ENDIAN = 'MM'
const TIFF_LITTLE_ENDIAN = 'II'

type ParsedMetadataPayload = {
  metadata: ImageMetadataMap
  editorTool: string | null
}

type IsoBmffItemInfo = {
  itemId: number
  itemType: string | null
  contentType: string | null
}

type IsoBmffItemLocation = {
  constructionMethod: number
  baseOffset: number
  extents: Array<{
    offset: number
    length: number
  }>
}

type BoxReference = {
  type: string
  start: number
  headerSize: number
  size: number
}

export type ExtractedImageUploadMetadata = {
  cameraModel: string | null
  capturedAt: string | null
  credit: string | null
  latitude: string | null
  longitude: string | null
  editorTool: string | null
}

const defaultExtractedMetadata = (): ExtractedImageUploadMetadata => ({
  cameraModel: null,
  capturedAt: null,
  credit: null,
  latitude: null,
  longitude: null,
  editorTool: null,
})

const textDecoder = new TextDecoder('utf-8', { fatal: false })

const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/gu, ' ').trim()

const decodeXmlEntities = (value: string): string =>
  value
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&')

const normalizeString = (value: string | null | undefined): string | null => {
  if (!value) return null

  const normalized = normalizeWhitespace(
    decodeXmlEntities(value.replaceAll('\u0000', '')),
  )

  return normalized.length > 0 ? normalized : null
}

const normalizeEditorTool = (value: string | null | undefined): string | null => {
  const normalized = normalizeString(value)
  return normalized && normalized.length > 1 ? normalized : null
}

const decodeText = (bytes: Uint8Array): string => textDecoder.decode(bytes)

const decodeAscii = (bytes: Uint8Array): string =>
  decodeText(bytes).replaceAll('\u0000', '').trim()

const getUint64 = (view: DataView, offset: number): number => {
  const high = view.getUint32(offset, false)
  const low = view.getUint32(offset + 4, false)
  return high * 2 ** 32 + low
}

const readFourCC = (view: DataView, offset: number): string =>
  decodeText(new Uint8Array(view.buffer, view.byteOffset + offset, 4))

const readNullTerminatedString = (
  bytes: Uint8Array,
  start: number,
): {
  value: string
  nextOffset: number
} => {
  let end = start

  while (end < bytes.length && bytes[end] !== 0) {
    end += 1
  }

  return {
    value: decodeText(bytes.subarray(start, end)),
    nextOffset: Math.min(end + 1, bytes.length),
  }
}

const collectBoxReferences = (
  view: DataView,
  start: number,
  end: number,
): BoxReference[] => {
  const boxes: BoxReference[] = []
  let offset = start

  while (offset + 8 <= end) {
    let size = view.getUint32(offset, false)
    const type = readFourCC(view, offset + 4)
    let headerSize = 8

    if (size === 1) {
      if (offset + 16 > end) break
      size = getUint64(view, offset + 8)
      headerSize = 16
    } else if (size === 0) {
      size = end - offset
    }

    if (size < headerSize || offset + size > end) {
      break
    }

    boxes.push({ type, start: offset, headerSize, size })
    offset += size
  }

  return boxes
}

const getTiffValueByteSize = (type: number, count: number): number => {
  const unitSize =
    type === 1 || type === 2 || type === 7
      ? 1
      : type === 3
        ? 2
        : type === 4 || type === 9
          ? 4
          : type === 5 || type === 10
            ? 8
            : 0

  return unitSize * count
}

const readRational = (
  view: DataView,
  offset: number,
  littleEndian: boolean,
  signed = false,
): number | null => {
  if (offset + 8 > view.byteLength) return null

  const numerator = signed
    ? view.getInt32(offset, littleEndian)
    : view.getUint32(offset, littleEndian)
  const denominator = signed
    ? view.getInt32(offset + 4, littleEndian)
    : view.getUint32(offset + 4, littleEndian)

  if (denominator === 0) return null
  return numerator / denominator
}

const readExifValue = (params: {
  view: DataView
  entryOffset: number
  tiffStart: number
  type: number
  count: number
  valueOffsetField: number
  littleEndian: boolean
}): string | number | number[] | null => {
  const { view, entryOffset, tiffStart, type, count, valueOffsetField, littleEndian } =
    params
  const totalBytes = getTiffValueByteSize(type, count)
  const valueOffset = totalBytes <= 4 ? entryOffset + 8 : tiffStart + valueOffsetField

  if (valueOffset < 0 || valueOffset + totalBytes > view.byteLength) {
    return null
  }

  if (type === 2) {
    return decodeAscii(
      new Uint8Array(view.buffer, view.byteOffset + valueOffset, totalBytes),
    )
  }

  if (type === 3) {
    if (count === 1) {
      return view.getUint16(valueOffset, littleEndian)
    }

    const values: number[] = []
    for (let index = 0; index < count; index += 1) {
      values.push(view.getUint16(valueOffset + index * 2, littleEndian))
    }
    return values
  }

  if (type === 4) {
    if (count === 1) {
      return view.getUint32(valueOffset, littleEndian)
    }

    const values: number[] = []
    for (let index = 0; index < count; index += 1) {
      values.push(view.getUint32(valueOffset + index * 4, littleEndian))
    }
    return values
  }

  if (type === 5 || type === 10) {
    const values: number[] = []
    for (let index = 0; index < count; index += 1) {
      const rational = readRational(
        view,
        valueOffset + index * 8,
        littleEndian,
        type === 10,
      )

      if (rational == null) return null
      values.push(rational)
    }

    return count === 1 ? values[0] : values
  }

  return null
}

const parseGpsCoordinate = (
  values: number[] | null | undefined,
  ref: string | null | undefined,
): string | null => {
  if (!values || values.length < 3) return null

  const [degrees, minutes, seconds] = values
  const sign = ref === 'S' || ref === 'W' ? -1 : 1
  const decimal = sign * (degrees + minutes / 60 + seconds / 3600)

  return Number.isFinite(decimal) ? String(decimal) : null
}

const mergeMetadataEntries = (
  target: ImageMetadataMap,
  source: ImageMetadataMap,
): void => {
  for (const [key, value] of Object.entries(source)) {
    if (!target[key] && value) {
      target[key] = value
    }
  }
}

const parseTiffPayload = (bytes: Uint8Array): ParsedMetadataPayload => {
  const metadata: ImageMetadataMap = {}
  let editorTool: string | null = null

  if (bytes.length < 8) {
    return { metadata, editorTool }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const byteOrder = decodeText(bytes.subarray(0, 2))
  const littleEndian = byteOrder === TIFF_LITTLE_ENDIAN

  if (byteOrder !== TIFF_LITTLE_ENDIAN && byteOrder !== TIFF_BIG_ENDIAN) {
    return { metadata, editorTool }
  }

  const firstIfdOffset = view.getUint32(4, littleEndian)
  const ifdQueue = [firstIfdOffset]
  const visitedIfds = new Set<number>()

  while (ifdQueue.length > 0) {
    const ifdOffset = ifdQueue.shift()

    if (
      ifdOffset == null ||
      visitedIfds.has(ifdOffset) ||
      ifdOffset < 0 ||
      ifdOffset + 2 > view.byteLength
    ) {
      continue
    }

    visitedIfds.add(ifdOffset)

    const entryCount = view.getUint16(ifdOffset, littleEndian)

    for (let index = 0; index < entryCount; index += 1) {
      const entryOffset = ifdOffset + 2 + index * 12
      if (entryOffset + 12 > view.byteLength) break

      const tag = view.getUint16(entryOffset, littleEndian)
      const type = view.getUint16(entryOffset + 2, littleEndian)
      const count = view.getUint32(entryOffset + 4, littleEndian)
      const valueOffsetField = view.getUint32(entryOffset + 8, littleEndian)
      const value = readExifValue({
        view,
        entryOffset,
        tiffStart: 0,
        type,
        count,
        valueOffsetField,
        littleEndian,
      })

      if (tag === 0x8769 || tag === 0x8825) {
        if (typeof value === 'number') {
          ifdQueue.push(value)
        }
        continue
      }

      if (tag === 0x010f && typeof value === 'string') metadata.Make = value
      if (tag === 0x0110 && typeof value === 'string') metadata.Model = value
      if (tag === 0x0131 && typeof value === 'string') {
        metadata.Software = value
        editorTool ??= normalizeEditorTool(value)
      }
      if (tag === 0x013b && typeof value === 'string') metadata.Artist = value
      if (tag === 0x8298 && typeof value === 'string') metadata.Copyright = value
      if (tag === 0x9003 && typeof value === 'string') {
        metadata.DateTimeOriginal = value
      }
      if (tag === 0x9004 && typeof value === 'string') metadata.CreateDate = value
      if (tag === 0x0132 && typeof value === 'string') metadata.ModifyDate = value
      if (tag === 0x0001 && typeof value === 'string') metadata.GPSLatitudeRef = value
      if (tag === 0x0002 && Array.isArray(value)) {
        metadata.GPSLatitude = parseGpsCoordinate(value, metadata.GPSLatitudeRef) ?? ''
      }
      if (tag === 0x0003 && typeof value === 'string') metadata.GPSLongitudeRef = value
      if (tag === 0x0004 && Array.isArray(value)) {
        metadata.GPSLongitude =
          parseGpsCoordinate(value, metadata.GPSLongitudeRef) ?? ''
      }
    }

    const nextIfdOffset = view.getUint32(ifdOffset + 2 + entryCount * 12, littleEndian)
    if (nextIfdOffset > 0) {
      ifdQueue.push(nextIfdOffset)
    }
  }

  return { metadata, editorTool }
}

const getXmlTagValue = (xml: string, tagNames: string[]): string | null => {
  for (const tagName of tagNames) {
    const elementMatch =
      xml.match(new RegExp(`<${tagName}>([^<]+)</${tagName}>`, 'u')) ??
      xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'u'))

    const elementValue = normalizeString(elementMatch?.[1] ?? null)
    if (elementValue) {
      return elementValue
    }

    const attributeMatch = xml.match(new RegExp(`${tagName}="([^"]+)"`, 'u'))
    const attributeValue = normalizeString(attributeMatch?.[1] ?? null)
    if (attributeValue) {
      return attributeValue
    }
  }

  return null
}

const getXmlSeqValue = (xml: string, tagNames: string[]): string | null => {
  for (const tagName of tagNames) {
    const seqMatch = xml.match(
      new RegExp(
        `<${tagName}[^>]*>[\\s\\S]*?<rdf:Seq>[\\s\\S]*?<rdf:li[^>]*>([^<]+)</rdf:li>[\\s\\S]*?</rdf:Seq>[\\s\\S]*?</${tagName}>`,
        'u',
      ),
    )
    const value = normalizeString(seqMatch?.[1] ?? null)
    if (value) {
      return value
    }
  }

  return null
}

const extractToolFromXmp = (xmpText: string): string | null => {
  const creatorTool = getXmlTagValue(xmpText, ['xmp:CreatorTool', 'CreatorTool'])
  if (creatorTool) {
    return normalizeEditorTool(creatorTool)
  }

  const matches = Array.from(
    xmpText.matchAll(
      /<(?:\w+:)?HistorySoftwareAgent>([^<]+)<\/(?:\w+:)?HistorySoftwareAgent>|(?:\w+:)?HistorySoftwareAgent="([^"]+)"/gu,
    ),
  )

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const candidate = normalizeEditorTool(matches[index]?.[1] ?? matches[index]?.[2])
    if (candidate) {
      return candidate
    }
  }

  return null
}

const parseXmpPayload = (xmpText: string): ParsedMetadataPayload => {
  const metadata: ImageMetadataMap = {}
  const cameraMake = getXmlTagValue(xmpText, ['tiff:Make', 'Make'])
  const cameraModel = getXmlTagValue(xmpText, ['tiff:Model', 'Model'])
  const software = getXmlTagValue(xmpText, ['xmp:CreatorTool', 'CreatorTool'])
  const credit =
    getXmlTagValue(xmpText, ['photoshop:Credit', 'Credit']) ??
    getXmlSeqValue(xmpText, ['dc:creator']) ??
    getXmlTagValue(xmpText, ['tiff:Artist', 'Artist', 'dc:rights'])
  const capturedAt =
    getXmlTagValue(xmpText, [
      'exif:DateTimeOriginal',
      'photoshop:DateCreated',
      'xmp:CreateDate',
      'xmp:ModifyDate',
    ]) ?? null
  const latitude = getXmlTagValue(xmpText, ['exif:GPSLatitude', 'GPSLatitude'])
  const longitude = getXmlTagValue(xmpText, ['exif:GPSLongitude', 'GPSLongitude'])

  if (cameraMake) metadata.Make = cameraMake
  if (cameraModel) metadata.Model = cameraModel
  if (software) metadata.Software = software
  if (credit) metadata.Credit = credit
  if (capturedAt) metadata.DateTimeOriginal = capturedAt
  if (latitude) metadata.GPSLatitude = latitude
  if (longitude) metadata.GPSLongitude = longitude

  return {
    metadata,
    editorTool: extractToolFromXmp(xmpText),
  }
}

const parseIptcApp13Payload = (bytes: Uint8Array): ParsedMetadataPayload => {
  const metadata: ImageMetadataMap = {}

  let offset = 0
  while (offset + 14 <= bytes.length) {
    const signature = decodeText(bytes.subarray(offset, offset + 13))
    if (signature !== 'Photoshop 3.0') {
      offset += 1
      continue
    }

    offset += 14

    while (offset + 12 <= bytes.length) {
      const resourceSignature = decodeText(bytes.subarray(offset, offset + 4))
      if (resourceSignature !== '8BIM') {
        break
      }

      const resourceId = (bytes[offset + 4] << 8) | bytes[offset + 5]
      offset += 6

      const nameLength = bytes[offset] ?? 0
      offset += 1 + nameLength
      if (((1 + nameLength) & 1) === 1) offset += 1

      if (offset + 4 > bytes.length) break
      const resourceSize =
        (bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]
      offset += 4

      if (offset + resourceSize > bytes.length) break
      const resourceData = bytes.subarray(offset, offset + resourceSize)
      offset += resourceSize
      if ((resourceSize & 1) === 1) offset += 1

      if (resourceId !== 0x0404) {
        continue
      }

      let iptcOffset = 0
      while (iptcOffset + 5 <= resourceData.length) {
        if (resourceData[iptcOffset] !== 0x1c) {
          iptcOffset += 1
          continue
        }

        const record = resourceData[iptcOffset + 1]
        const dataset = resourceData[iptcOffset + 2]
        const size = (resourceData[iptcOffset + 3] << 8) | resourceData[iptcOffset + 4]
        iptcOffset += 5

        if (iptcOffset + size > resourceData.length) break

        const value = normalizeString(
          decodeText(resourceData.subarray(iptcOffset, iptcOffset + size)),
        )
        iptcOffset += size

        if (!value || record !== 2) continue

        if (dataset === 0x50) metadata.Byline = value
        if (dataset === 0x6e) metadata.Credit = value
        if (dataset === 0x74) metadata.CopyrightNotice = value
        if (dataset === 0x37) metadata.DateCreated = value
        if (dataset === 0x3c) metadata.TimeCreated = value
      }
    }
  }

  return { metadata, editorTool: null }
}

const parseExifPayload = (bytes: Uint8Array): ParsedMetadataPayload => {
  if (
    bytes.length >= EXIF_HEADER.length &&
    decodeText(bytes.subarray(0, 6)) === EXIF_HEADER
  ) {
    return parseTiffPayload(bytes.subarray(EXIF_HEADER.length))
  }

  if (bytes.length >= 8) {
    const byteOrder = decodeText(bytes.subarray(0, 2))
    if (byteOrder === TIFF_LITTLE_ENDIAN || byteOrder === TIFF_BIG_ENDIAN) {
      return parseTiffPayload(bytes)
    }

    const exifOffsetView = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    )
    const offset = exifOffsetView.getUint32(0, false)
    const payloadStart = 4 + offset

    if (payloadStart + 8 <= bytes.length) {
      const nestedByteOrder = decodeText(bytes.subarray(payloadStart, payloadStart + 2))
      if (
        nestedByteOrder === TIFF_LITTLE_ENDIAN ||
        nestedByteOrder === TIFF_BIG_ENDIAN
      ) {
        return parseTiffPayload(bytes.subarray(payloadStart))
      }
    }
  }

  return { metadata: {}, editorTool: null }
}

const parseJpegPayload = (bytes: Uint8Array): ParsedMetadataPayload => {
  const metadata: ImageMetadataMap = {}
  let editorTool: string | null = null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  if (view.byteLength < 4 || view.getUint16(0, false) !== JPEG_SOI_MARKER) {
    return { metadata, editorTool }
  }

  let offset = 2

  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break

    const marker = view.getUint16(offset, false)
    offset += 2

    if (marker === 0xffda || marker === 0xffd9) break
    if (offset + 2 > view.byteLength) break

    const segmentLength = view.getUint16(offset, false)
    if (segmentLength < 2 || offset + segmentLength > view.byteLength) break

    const segmentStart = offset + 2
    const segmentEnd = offset + segmentLength
    const segmentBytes = bytes.subarray(segmentStart, segmentEnd)
    const segmentHeader = decodeText(
      segmentBytes.subarray(0, Math.min(64, segmentBytes.length)),
    )

    if (marker === JPEG_APP1_MARKER) {
      if (segmentHeader.startsWith(EXIF_HEADER)) {
        const parsed = parseExifPayload(segmentBytes)
        mergeMetadataEntries(metadata, parsed.metadata)
        editorTool ??= parsed.editorTool
      } else if (
        segmentHeader.startsWith(XMP_HEADER) ||
        segmentHeader.includes('<x:xmpmeta')
      ) {
        const parsed = parseXmpPayload(decodeText(segmentBytes))
        mergeMetadataEntries(metadata, parsed.metadata)
        editorTool ??= parsed.editorTool
      }
    }

    if (marker === JPEG_APP13_MARKER) {
      const parsed = parseIptcApp13Payload(segmentBytes)
      mergeMetadataEntries(metadata, parsed.metadata)
    }

    offset = segmentEnd
  }

  return { metadata, editorTool }
}

const hasPngSignature = (bytes: Uint8Array): boolean =>
  PNG_SIGNATURE.every((value, index) => bytes[index] === value)

const decompressDeflate = async (bytes: Uint8Array): Promise<Uint8Array | null> => {
  if (typeof DecompressionStream === 'undefined') {
    return null
  }

  try {
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream('deflate'))
    const buffer = await new Response(stream).arrayBuffer()
    return new Uint8Array(buffer)
  } catch {
    return null
  }
}

const parsePngPayload = async (bytes: Uint8Array): Promise<ParsedMetadataPayload> => {
  const metadata: ImageMetadataMap = {}
  let editorTool: string | null = null

  if (bytes.length < PNG_SIGNATURE.length || !hasPngSignature(bytes)) {
    return { metadata, editorTool }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = PNG_SIGNATURE.length

  while (offset + 12 <= bytes.length) {
    const chunkLength = view.getUint32(offset, false)
    const chunkType = readFourCC(view, offset + 4)
    const chunkDataStart = offset + 8
    const chunkDataEnd = chunkDataStart + chunkLength

    if (chunkDataEnd + 4 > bytes.length) break

    const chunkBytes = bytes.subarray(chunkDataStart, chunkDataEnd)

    if (chunkType === 'eXIf') {
      const parsed = parseExifPayload(chunkBytes)
      mergeMetadataEntries(metadata, parsed.metadata)
      editorTool ??= parsed.editorTool
    }

    if (chunkType === 'tEXt') {
      const separatorIndex = chunkBytes.indexOf(0)
      if (separatorIndex > 0) {
        const keyword = decodeAscii(chunkBytes.subarray(0, separatorIndex))
        const value = decodeText(chunkBytes.subarray(separatorIndex + 1))
        if (keyword === 'XML:com.adobe.xmp') {
          const parsed = parseXmpPayload(value)
          mergeMetadataEntries(metadata, parsed.metadata)
          editorTool ??= parsed.editorTool
        }
      }
    }

    if (chunkType === 'iTXt') {
      const keywordEnd = chunkBytes.indexOf(0)
      if (keywordEnd > 0 && keywordEnd + 5 < chunkBytes.length) {
        const keyword = decodeAscii(chunkBytes.subarray(0, keywordEnd))
        const compressionFlag = chunkBytes[keywordEnd + 1] ?? 0
        let cursor = keywordEnd + 3

        while (cursor < chunkBytes.length && chunkBytes[cursor] !== 0) cursor += 1
        cursor += 1
        while (cursor < chunkBytes.length && chunkBytes[cursor] !== 0) cursor += 1
        cursor += 1

        let textBytes = chunkBytes.subarray(cursor)
        if (compressionFlag === 1) {
          const decompressed = await decompressDeflate(textBytes)
          if (decompressed) {
            textBytes = decompressed
          }
        }

        if (keyword === 'XML:com.adobe.xmp') {
          const parsed = parseXmpPayload(decodeText(textBytes))
          mergeMetadataEntries(metadata, parsed.metadata)
          editorTool ??= parsed.editorTool
        }
      }
    }

    if (chunkType === 'IEND') break

    offset = chunkDataEnd + 4
  }

  return { metadata, editorTool }
}

const parseWebpPayload = (bytes: Uint8Array): ParsedMetadataPayload => {
  const metadata: ImageMetadataMap = {}
  let editorTool: string | null = null

  if (
    bytes.length < 16 ||
    decodeText(bytes.subarray(0, 4)) !== RIFF_HEADER ||
    decodeText(bytes.subarray(8, 12)) !== WEBP_HEADER
  ) {
    return { metadata, editorTool }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 12

  while (offset + 8 <= bytes.length) {
    const chunkType = readFourCC(view, offset)
    const chunkLength = view.getUint32(offset + 4, true)
    const chunkDataStart = offset + 8
    const chunkDataEnd = chunkDataStart + chunkLength
    if (chunkDataEnd > bytes.length) break

    const chunkBytes = bytes.subarray(chunkDataStart, chunkDataEnd)

    if (chunkType === 'EXIF') {
      const parsed = parseExifPayload(chunkBytes)
      mergeMetadataEntries(metadata, parsed.metadata)
      editorTool ??= parsed.editorTool
    }

    if (chunkType === 'XMP ') {
      const parsed = parseXmpPayload(decodeText(chunkBytes))
      mergeMetadataEntries(metadata, parsed.metadata)
      editorTool ??= parsed.editorTool
    }

    offset = chunkDataEnd + (chunkLength % 2)
  }

  return { metadata, editorTool }
}

const parseIlocBox = (bytes: Uint8Array): Map<number, IsoBmffItemLocation> => {
  const locations = new Map<number, IsoBmffItemLocation>()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  if (bytes.length < 8) {
    return locations
  }

  const version = bytes[0] ?? 0
  const firstFieldByte = bytes[4] ?? 0
  const secondFieldByte = bytes[5] ?? 0
  const offsetSize = firstFieldByte >> 4
  const lengthSize = firstFieldByte & 0x0f
  const baseOffsetSize = secondFieldByte >> 4
  const indexSize = version === 1 || version === 2 ? secondFieldByte & 0x0f : 0

  const readVariableInt = (offset: number, size: number): number => {
    let value = 0
    for (let index = 0; index < size; index += 1) {
      value = value * 256 + (bytes[offset + index] ?? 0)
    }
    return value
  }

  let cursor = 6
  const itemCount =
    version < 2 ? view.getUint16(cursor, false) : view.getUint32(cursor, false)
  cursor += version < 2 ? 2 : 4

  for (let index = 0; index < itemCount; index += 1) {
    const itemId =
      version < 2 ? view.getUint16(cursor, false) : view.getUint32(cursor, false)
    cursor += version < 2 ? 2 : 4

    let constructionMethod = 0
    if (version === 1 || version === 2) {
      constructionMethod = view.getUint16(cursor, false) & 0x000f
      cursor += 2
    }

    cursor += 2
    const baseOffset = readVariableInt(cursor, baseOffsetSize)
    cursor += baseOffsetSize

    const extentCount = view.getUint16(cursor, false)
    cursor += 2

    const extents: IsoBmffItemLocation['extents'] = []
    for (let extentIndex = 0; extentIndex < extentCount; extentIndex += 1) {
      if ((version === 1 || version === 2) && indexSize > 0) {
        cursor += indexSize
      }

      const extentOffset = readVariableInt(cursor, offsetSize)
      cursor += offsetSize
      const extentLength = readVariableInt(cursor, lengthSize)
      cursor += lengthSize

      extents.push({
        offset: extentOffset,
        length: extentLength,
      })
    }

    locations.set(itemId, {
      constructionMethod,
      baseOffset,
      extents,
    })
  }

  return locations
}

const parseIinfBox = (bytes: Uint8Array): Map<number, IsoBmffItemInfo> => {
  const entries = new Map<number, IsoBmffItemInfo>()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  if (bytes.length < 8) {
    return entries
  }

  const version = bytes[0] ?? 0
  let cursor = 4
  const entryCount =
    version === 0 ? view.getUint16(cursor, false) : view.getUint32(cursor, false)
  cursor += version === 0 ? 2 : 4

  const boxes = collectBoxReferences(view, cursor, bytes.length)
  let processed = 0

  for (const box of boxes) {
    if (box.type !== 'infe') continue
    if (processed >= entryCount) break

    const boxBytes = bytes.subarray(box.start + box.headerSize, box.start + box.size)
    const boxView = new DataView(
      boxBytes.buffer,
      boxBytes.byteOffset,
      boxBytes.byteLength,
    )
    const boxVersion = boxBytes[0] ?? 0
    let offset = 4

    if (boxVersion < 2) {
      continue
    }

    const itemId =
      boxVersion === 2
        ? boxView.getUint16(offset, false)
        : boxView.getUint32(offset, false)
    offset += boxVersion === 2 ? 2 : 4
    offset += 2

    const itemType = readFourCC(boxView, offset)
    offset += 4

    const nameInfo = readNullTerminatedString(boxBytes, offset)
    offset = nameInfo.nextOffset

    let contentType: string | null = null
    if (itemType === 'mime') {
      const contentTypeInfo = readNullTerminatedString(boxBytes, offset)
      contentType = normalizeString(contentTypeInfo.value)
    }

    entries.set(itemId, {
      itemId,
      itemType,
      contentType,
    })
    processed += 1
  }

  return entries
}

const resolveIsoBmffItemPayload = (params: {
  bytes: Uint8Array
  location: IsoBmffItemLocation
  idatPayload: Uint8Array | null
}): Uint8Array | null => {
  const chunks: Uint8Array[] = []
  const sourceBytes =
    params.location.constructionMethod === 1 ? params.idatPayload : params.bytes

  if (!sourceBytes) return null

  for (const extent of params.location.extents) {
    const start = params.location.baseOffset + extent.offset
    const end = start + extent.length

    if (start < 0 || end > sourceBytes.length) {
      return null
    }

    chunks.push(sourceBytes.subarray(start, end))
  }

  if (chunks.length === 0) {
    return null
  }

  if (chunks.length === 1) {
    return chunks[0] ?? null
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const payload = new Uint8Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    payload.set(chunk, offset)
    offset += chunk.length
  }

  return payload
}

const parseIsoBmffPayload = (bytes: Uint8Array): ParsedMetadataPayload => {
  const metadata: ImageMetadataMap = {}
  let editorTool: string | null = null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const topLevelBoxes = collectBoxReferences(view, 0, bytes.length)
  let idatPayload: Uint8Array | null = null
  let itemInfos = new Map<number, IsoBmffItemInfo>()
  let itemLocations = new Map<number, IsoBmffItemLocation>()

  for (const box of topLevelBoxes) {
    if (box.type !== 'meta') continue

    const metaStart = box.start + box.headerSize + 4
    const metaEnd = box.start + box.size
    const childBoxes = collectBoxReferences(view, metaStart, metaEnd)

    for (const childBox of childBoxes) {
      const childBytes = bytes.subarray(
        childBox.start + childBox.headerSize,
        childBox.start + childBox.size,
      )

      if (childBox.type === 'iinf') {
        itemInfos = parseIinfBox(childBytes)
      }

      if (childBox.type === 'iloc') {
        itemLocations = parseIlocBox(childBytes)
      }

      if (childBox.type === 'idat') {
        idatPayload = childBytes
      }
    }
  }

  for (const itemInfo of itemInfos.values()) {
    const location = itemLocations.get(itemInfo.itemId)
    if (!location) continue

    const payload = resolveIsoBmffItemPayload({
      bytes,
      location,
      idatPayload,
    })
    if (!payload) continue

    if (itemInfo.itemType === 'Exif') {
      const parsed = parseExifPayload(payload)
      mergeMetadataEntries(metadata, parsed.metadata)
      editorTool ??= parsed.editorTool
    }

    if (
      itemInfo.itemType === 'mime' &&
      itemInfo.contentType &&
      /(?:rdf\+xml|xmp|xml)/iu.test(itemInfo.contentType)
    ) {
      const parsed = parseXmpPayload(decodeText(payload))
      mergeMetadataEntries(metadata, parsed.metadata)
      editorTool ??= parsed.editorTool
    }
  }

  return { metadata, editorTool }
}

const parseJxlPayload = (bytes: Uint8Array): ParsedMetadataPayload => {
  const metadata: ImageMetadataMap = {}
  let editorTool: string | null = null

  if (bytes.length < 12) {
    return { metadata, editorTool }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const boxes = collectBoxReferences(view, 0, bytes.length)
  const hasContainer = boxes.some(box => box.type === JXL_CONTAINER_BRAND)

  if (!hasContainer) {
    return { metadata, editorTool }
  }

  for (const box of boxes) {
    const payload = bytes.subarray(box.start + box.headerSize, box.start + box.size)

    if (box.type === 'Exif') {
      const parsed = parseExifPayload(payload)
      mergeMetadataEntries(metadata, parsed.metadata)
      editorTool ??= parsed.editorTool
    }

    if (box.type === 'xml ') {
      const parsed = parseXmpPayload(decodeText(payload))
      mergeMetadataEntries(metadata, parsed.metadata)
      editorTool ??= parsed.editorTool
    }
  }

  return { metadata, editorTool }
}

const toNormalizedExtractedMetadata = (
  parsed: ParsedMetadataPayload,
): ExtractedImageUploadMetadata => {
  const coordinates = getCoordinatesFromMetadata(parsed.metadata)

  return {
    cameraModel: getCameraFromMetadata(parsed.metadata) ?? null,
    capturedAt:
      Object.keys(parsed.metadata).length > 0
        ? getCapturedAtFromMetadata(parsed.metadata)
        : null,
    credit: getCreditFromMetadata(parsed.metadata) ?? null,
    latitude: coordinates.latitude ?? null,
    longitude: coordinates.longitude ?? null,
    editorTool:
      parsed.editorTool ?? normalizeEditorTool(parsed.metadata.Software) ?? null,
  }
}

/**
 * Extracts normalized image metadata from the original source upload before any client-side
 * resize or transcode occurs.
 *
 * @param file Source upload file.
 * @returns Normalized metadata fields used by the upload pipeline.
 */
export async function extractImageUploadMetadata(
  file: File,
): Promise<ExtractedImageUploadMetadata> {
  try {
    const probe = new Uint8Array(
      await file
        .slice(0, Math.min(file.size, MAX_CLIENT_METADATA_PROBE_BYTES))
        .arrayBuffer(),
    )
    const type = file.type.toLowerCase()
    const lowerName = file.name.toLowerCase()

    const parsed =
      type === 'image/jpeg' || /\.(jpe?g)$/iu.test(lowerName)
        ? parseJpegPayload(probe)
        : type === 'image/png' || /\.png$/iu.test(lowerName)
          ? await parsePngPayload(probe)
          : type === 'image/webp' || /\.webp$/iu.test(lowerName)
            ? parseWebpPayload(probe)
            : type === 'image/tiff' ||
                type === 'image/x-tiff' ||
                /\.(tiff?|tif)$/iu.test(lowerName)
              ? parseTiffPayload(probe)
              : type === 'image/avif' ||
                  type === 'image/heic' ||
                  type === 'image/heic-sequence' ||
                  type === 'image/heif' ||
                  type === 'image/heif-sequence' ||
                  /\.(avif|heic|heif)$/iu.test(lowerName)
                ? parseIsoBmffPayload(probe)
                : type === 'image/jxl' || /\.jxl$/iu.test(lowerName)
                  ? parseJxlPayload(probe)
                  : { metadata: {}, editorTool: null }

    return toNormalizedExtractedMetadata(parsed)
  } catch (error) {
    console.warn('[image.metadata] upload extraction failed', {
      filename: file.name,
      error,
    })

    return defaultExtractedMetadata()
  }
}
