// COMPRESSION
import { inflateRawSync } from 'node:zlib'
// GEOMETRY
import proj4 from 'proj4'

// TOC: Sheet lookup | ZIP index | Model extraction
const indexUrl =
  'https://portal.csdi.gov.hk/server/rest/services/common/landsd_rcd_1671676915450_88604/FeatureServer/0/query'
const hkGrid =
  '+proj=tmerc +lat_0=22.3121333333333 +lon_0=114.178555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +towgs84=-162.619,-276.959,-161.764,-0.067753,2.243648,1.158827,-1.094246 +units=m +no_defs'
const maxDirectoryBytes = 8 * 1024 * 1024
const maxFileBytes = 32 * 1024 * 1024
const maxModelBytes = 48 * 1024 * 1024

export type CsdiModelCandidate = { id: string; distance: number }
type ZipEntry = {
  name: string
  offset: number
  compressed: number
  size: number
  method: number
}
type SheetArchive = {
  sheet: string
  url: string
  entries: ZipEntry[]
  etag: string
  lastModified: string | null
  revisionDate: number | null
  x: number
  y: number
}

/** Fetch a bounded byte range and reject servers that return a whole archive.
 * @param url Official archive URL. @param start First byte. @param end Last byte. @param etag Archive version fence.
 * @returns Exact range bytes.
 */
async function range(
  url: string,
  start: number,
  end: number,
  etag: string,
): Promise<Uint8Array> {
  const response = await fetch(url, {
    redirect: 'error',
    headers: { Range: `bytes=${start}-${end}`, 'If-Range': etag },
  })
  if (
    response.status !== 206 ||
    response.headers.get('content-range')?.split('/')[0] !== `bytes ${start}-${end}`
  )
    throw new Error('CSDI did not return the requested archive range')
  const data = new Uint8Array(await response.arrayBuffer())
  if (data.length !== end - start + 1) throw new Error('Incomplete CSDI archive range')
  return data
}

/** Resolve the map sheet and read its central directory without downloading the sheet.
 * @param coordinates Longitude and latitude. @returns Archive index and projected point.
 */
export async function lookupSheet(
  coordinates: [number, number],
): Promise<SheetArchive> {
  const [x, y] = proj4('WGS84', hkGrid, coordinates)
  const query = new URL(indexUrl)
  for (const [key, value] of Object.entries({
    geometry: `${coordinates[0]},${coordinates[1]}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'SHEETNO,Format_glTF,REVISIONDATE',
    returnGeometry: 'false',
    f: 'json',
  }))
    query.searchParams.set(key, value)
  const response = await fetch(query)
  if (!response.ok) throw new Error('Could not query the CSDI sheet index')
  const body = (await response.json()) as {
    features?: {
      attributes?: { SHEETNO?: string; Format_glTF?: string; REVISIONDATE?: number }
    }[]
  }
  const item = body.features?.[0]?.attributes
  if (!item?.SHEETNO || !item.Format_glTF)
    throw new Error('No CSDI model sheet covers this location')
  const archive = new URL(item.Format_glTF)
  if (
    archive.protocol !== 'https:' ||
    archive.hostname !== 'download.map.gov.hk' ||
    !/^\/api\/3d-zip\/GLTF\/[\w-]+\.zip$/.test(archive.pathname)
  )
    throw new Error('Invalid CSDI archive URL')
  const head = await fetch(archive, { method: 'HEAD', redirect: 'error' })
  const etag = head.headers.get('etag')
  const length = Number(head.headers.get('content-length'))
  if (
    !head.ok ||
    !etag ||
    etag.startsWith('W/') ||
    !Number.isSafeInteger(length) ||
    length < 22
  )
    throw new Error('Could not inspect CSDI archive')
  const tailStart = Math.max(0, length - 65557)
  const tail = await range(archive.href, tailStart, length - 1, etag)
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)
  let end = tail.length - 22
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--
  if (end < 0) throw new Error('CSDI archive index is missing')
  const count = view.getUint16(end + 10, true),
    size = view.getUint32(end + 12, true),
    offset = view.getUint32(end + 16, true)
  if (
    count === 65535 ||
    size > maxDirectoryBytes ||
    offset + size > length ||
    size < 46
  )
    throw new Error('Unsupported CSDI archive index')
  const directory = await range(archive.href, offset, offset + size - 1, etag)
  const bytes = new DataView(
    directory.buffer,
    directory.byteOffset,
    directory.byteLength,
  )
  const entries: ZipEntry[] = []
  let pos = 0
  for (let i = 0; i < count; i++) {
    if (pos + 46 > size || bytes.getUint32(pos, true) !== 0x02014b50)
      throw new Error('Invalid CSDI archive index')
    const nameLength = bytes.getUint16(pos + 28, true),
      extraLength = bytes.getUint16(pos + 30, true),
      commentLength = bytes.getUint16(pos + 32, true)
    if (pos + 46 + nameLength + extraLength + commentLength > size)
      throw new Error('Invalid CSDI archive entry')
    const name = new TextDecoder().decode(
      directory.subarray(pos + 46, pos + 46 + nameLength),
    )
    entries.push({
      name,
      method: bytes.getUint16(pos + 10, true),
      compressed: bytes.getUint32(pos + 20, true),
      size: bytes.getUint32(pos + 24, true),
      offset: bytes.getUint32(pos + 42, true),
    })
    pos += 46 + nameLength + extraLength + commentLength
  }
  return {
    sheet: item.SHEETNO,
    url: archive.href,
    entries,
    etag,
    lastModified: head.headers.get('last-modified'),
    revisionDate: item.REVISIONDATE ?? null,
    x,
    y,
  }
}

/** List source model identifiers on the sheet for explicit review.
 * @param sheet Indexed archive. @returns Candidates ordered by distance in metres.
 */
export function modelCandidates(sheet: SheetArchive): CsdiModelCandidate[] {
  return sheet.entries
    .flatMap(entry => {
      const match = /^BUILDING\/(B(\d{5})(\d{5})[a-zA-Z0-9]*)\/\1\.gltf$/.exec(
        entry.name,
      )
      if (!match) return []
      const distance = Math.hypot(
        Number(match[2]) + 800000 - sheet.x,
        Number(match[3]) + 800000 - sheet.y,
      )
      return [{ id: match[1], distance: Math.round(distance) }]
    })
    .sort((a, b) => a.distance - b.distance)
}

/** Extract a bounded ZIP entry using its central-directory record.
 * @param archive Indexed sheet. @param entry Selected source file. @returns Decompressed bytes.
 */
async function extract(archive: SheetArchive, entry: ZipEntry): Promise<Uint8Array> {
  if (
    entry.size > maxFileBytes ||
    entry.compressed > maxFileBytes ||
    ![0, 8].includes(entry.method)
  )
    throw new Error('Unsupported CSDI model file')
  const header = await range(archive.url, entry.offset, entry.offset + 29, archive.etag)
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
  if (view.getUint32(0, true) !== 0x04034b50)
    throw new Error('Invalid CSDI model header')
  const start = entry.offset + 30 + view.getUint16(26, true) + view.getUint16(28, true)
  const compressed = await range(
    archive.url,
    start,
    start + entry.compressed - 1,
    archive.etag,
  )
  const result =
    entry.method === 8
      ? inflateRawSync(compressed, { maxOutputLength: maxFileBytes })
      : compressed
  if (result.length !== entry.size) throw new Error('Incomplete CSDI model file')
  return result
}

/** Retrieve an explicitly chosen model and its local glTF dependencies.
 * @param archive Indexed sheet. @param id Source model ID. @returns glTF and referenced files.
 */
export async function extractModel(
  archive: SheetArchive,
  id: string,
): Promise<Map<string, Uint8Array>> {
  if (!modelCandidates(archive).some(candidate => candidate.id === id))
    throw new Error('Model is not present in this sheet')
  const prefix = `BUILDING/${id}/`
  const modelEntry = archive.entries.find(entry => entry.name === `${prefix}${id}.gltf`)
  if (!modelEntry) throw new Error('CSDI model is unavailable')
  const model = await extract(archive, modelEntry)
  const parsed = JSON.parse(new TextDecoder().decode(model)) as {
    buffers?: { uri?: string }[]
    images?: { uri?: string }[]
  }
  const names = [...(parsed.buffers ?? []), ...(parsed.images ?? [])]
    .map(item => item.uri)
    .filter((value): value is string => Boolean(value))
  if (
    names.length > 30 ||
    names.some(name => !/^[a-zA-Z0-9_.-]+\.(bin|jpg|jpeg|png)$/i.test(name))
  )
    throw new Error('Unsupported CSDI model dependencies')
  const files = new Map<string, Uint8Array>([[`${id}.gltf`, model]])
  let totalSize = model.length
  for (const name of new Set(names)) {
    const entry = archive.entries.find(item => item.name === prefix + name)
    if (!entry) throw new Error('CSDI model dependency is missing')
    totalSize += entry.size
    if (totalSize > maxModelBytes) throw new Error('CSDI model is too large')
    files.set(name, await extract(archive, entry))
  }
  return files
}
