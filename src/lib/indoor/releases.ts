// VALIDATION
import { z } from 'zod'
// MODEL
import { layerNames, type IndoorData } from './model'

/** Stable object identifiers are local to a map, not display labels or coordinates. */
export const mapIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/)
export const releaseHashSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const entranceSideSchema = z.strictObject({
  polygonIndex: z.number().int().nonnegative(),
  edgeIndex: z.number().int().nonnegative(),
})
export type EntranceSide = z.infer<typeof entranceSideSchema>
export const connectionSchema = z.strictObject({
  from: z.string().min(1).max(200),
  to: z.string().min(1).max(200),
  fromLevel: z.string().min(1).max(200),
  toLevel: z.string().min(1).max(200),
  category: z.enum(['stairs', 'steps', 'escalator', 'elevator', 'ramp']),
  evidence: z.enum([
    'aligned-footprints',
    'matching-lift-code',
    'reviewed-layout',
    'editor-verified',
  ]),
  evidenceUrl: z
    .string()
    .url()
    .max(2000)
    .refine(url => /^https?:\/\//.test(url), 'Use an HTTP or HTTPS evidence URL')
    .optional(),
  direction: z.enum(['both', 'forward']).nullable(),
  enabled: z.boolean(),
  fromEntrance: entranceSideSchema.nullable().optional(),
  toEntrance: entranceSideSchema.nullable().optional(),
})
export type MapConnection = z.infer<typeof connectionSchema>
export type MapBundle = {
  schemaVersion: 1
  data: IndoorData
  documents: { kind: string; path: string }[]
}
export type MapCatalogueEntry = {
  id: string
  code: string
  name: string
  nameZh: string
  kind: 'station' | 'building'
  publishedHash: string | null
  footprint: IndoorData['venue_polygon'] | null
}

/** Validate complete releases and all explicit connection endpoints before storing them.
 * @param input Parsed JSON bundle. @returns Validated bundle. @remarks Geometry remains source data; no endpoint is inferred during publication.
 */
export function validateMapBundle(input: unknown): MapBundle {
  const envelope = z
    .object({
      schemaVersion: z.literal(1),
      data: z.record(z.string(), z.unknown()),
      documents: z
        .array(
          z.object({
            kind: z.string().max(80),
            path: z
              .string()
              .url()
              .refine(p => p.startsWith('https://')),
          }),
        )
        .max(100),
    })
    .parse(input)
  const data = envelope.data as unknown as IndoorData
  if (
    !data.retrievedAt ||
    (data.coordinateSpace && data.coordinateSpace !== 'image-pixels')
  )
    throw new Error('Invalid map coordinates or provenance')
  const ids = new Set<string>(),
    levels = new Set<string>()
  for (const layer of layerNames) {
    const collection = data[layer]
    if (
      collection?.type !== 'FeatureCollection' ||
      !Array.isArray(collection.features) ||
      collection.features.length > 50000
    )
      throw new Error(`Invalid ${layer}`)
    for (const f of collection.features) {
      if (
        f.type !== 'Feature' ||
        !f.properties ||
        !f.geometry ||
        !['Point', 'LineString', 'Polygon', 'MultiPolygon'].includes(f.geometry.type)
      )
        throw new Error('Invalid map feature')
      const check = (value: unknown): void => {
        if (!Array.isArray(value) || !value.length) throw new Error('Empty coordinates')
        if (typeof value[0] === 'number') {
          if (
            value.length < 2 ||
            !value.every(v => typeof v === 'number' && Number.isFinite(v))
          )
            throw new Error('Invalid coordinates')
        } else value.forEach(check)
      }
      if ('coordinates' in f.geometry) check(f.geometry.coordinates)
      // Reject malformed nesting and unclosed polygon rings before rendering or routing.
      const position = (p: unknown): boolean =>
        Array.isArray(p) &&
        p.length >= 2 &&
        p.every(v => typeof v === 'number' && Number.isFinite(v))
      const ring = (r: unknown): boolean =>
        Array.isArray(r) &&
        r.length >= 4 &&
        r.every(position) &&
        r[0][0] === r.at(-1)[0] &&
        r[0][1] === r.at(-1)[1]
      const polygon = (p: unknown): boolean =>
        Array.isArray(p) && p.length > 0 && p.every(ring)
      if (
        (f.geometry.type === 'Point' && !position(f.geometry.coordinates)) ||
        (f.geometry.type === 'LineString' &&
          (f.geometry.coordinates.length < 2 ||
            !f.geometry.coordinates.every(position))) ||
        (f.geometry.type === 'Polygon' && !polygon(f.geometry.coordinates)) ||
        (f.geometry.type === 'MultiPolygon' &&
          (!f.geometry.coordinates.length || !f.geometry.coordinates.every(polygon)))
      )
        throw new Error('Malformed geometry')

      if (layer === 'level_polygon') {
        const id = f.properties.level_id
        if (typeof id !== 'string' || !id || levels.has(id))
          throw new Error('Duplicate or missing floor identity')
        levels.add(id)
      }
      if (layer === 'unit_polygon') {
        const id = f.properties.unit_id
        if (typeof id !== 'string' || !id || ids.has(id))
          throw new Error('Duplicate or missing unit identity')
        ids.add(id)
      }
    }
  }
  if (!data.venue_polygon.features.length || !levels.size)
    throw new Error('Map has no venue or floors')
  for (const layer of layerNames.filter(l => l !== 'venue_polygon'))
    for (const f of data[layer].features)
      if (!levels.has(String(f.properties.level_id)))
        throw new Error('Unknown feature floor')
  const connections = z.array(connectionSchema).max(10000).parse(data.connections)
  const seen = new Set<string>()
  for (const c of connections) {
    const from = data.unit_polygon.features.find(f => f.properties.unit_id === c.from)
    const to = data.unit_polygon.features.find(f => f.properties.unit_id === c.to)
    if (
      !from ||
      !to ||
      from.properties.level_id !== c.fromLevel ||
      to.properties.level_id !== c.toLevel ||
      c.from === c.to ||
      c.fromLevel === c.toLevel
    )
      throw new Error('Invalid connection endpoints')
    for (const [feature, side] of [
      [from, c.fromEntrance],
      [to, c.toEntrance],
    ] as const) {
      if (!side) continue
      const polygons =
        feature.geometry.type === 'Polygon'
          ? [feature.geometry.coordinates]
          : feature.geometry.type === 'MultiPolygon'
            ? feature.geometry.coordinates
            : []
      const ring = polygons[side.polygonIndex]?.[0]
      if (!ring || side.edgeIndex >= ring.length - 1)
        throw new Error('Invalid connection entrance side')
    }
    if (
      from.properties.unit_category !== c.category ||
      to.properties.unit_category !== c.category
    )
      throw new Error('Connection category does not match its endpoints')
    if (
      c.evidence === 'matching-lift-code' &&
      (c.category !== 'elevator' ||
        !/^L\d+$/.test(String(from.properties.unit_name_en)) ||
        from.properties.unit_name_en !== to.properties.unit_name_en)
    )
      throw new Error(
        'Matching lift evidence requires matching source lift identifiers',
      )
    if (c.evidence === 'reviewed-layout' && !c.evidenceUrl)
      throw new Error('Reviewed connections require evidence')
    const key = [c.from, c.to].sort().join(':')
    if (seen.has(key)) throw new Error('Duplicate connection')
    seen.add(key)
  }
  return {
    schemaVersion: 1,
    data: { ...data, connections },
    documents: envelope.documents,
  }
}

/** Compute an immutable release identity from exact stored bytes. @param text JSON bytes. @returns SHA-256 hex. */
export async function mapHash(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('')
}
/** Build a bounded R2 object key. @param id Map identity. @param hash Content identity. @returns Namespaced key. */
export function mapReleaseKey(id: string, hash: string): string {
  return `premises-maps/${mapIdSchema.parse(id)}/releases/${releaseHashSchema.parse(hash)}.json`
}
