// THIRD PARTY
import { z } from 'zod'

const position = z.array(z.number().finite()).min(2)
const ring = z.array(position).min(4)
export const polygonSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(ring).min(1) }),
  z.object({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(z.array(ring).min(1)).min(1),
  }),
])
const definition = z.object({
  divisionId: z.string(),
  apiReleaseSet: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  membershipGeometry: z.array(z.object({ geometry: polygonSchema })),
})
export const changeSchema = z.object({
  id: z.string(),
  divisionId: z.string(),
  type: z.enum(['addition', 'deletion', 'revision']),
  canAffectGeocodingMembership: z.boolean(),
  before: definition.nullable(),
  after: definition.nullable(),
  affectedDescendantIds: z.object({
    before: z.array(z.string()),
    after: z.array(z.string()),
  }),
})
export const changesSchema = z.object({
  data: z.array(changeSchema),
  meta: z.object({
    fromApiReleaseSet: z.object({ id: z.string(), code: z.string() }),
    toApiReleaseSet: z.object({ id: z.string(), code: z.string() }),
    comparisonId: z.string(),
    nextCursor: z.string().nullable(),
    membershipGeometry: z.literal('stub'),
  }),
})
const identifier = z.object({ type: z.literal('divisions'), id: z.string() })
const relationship = z.object({
  data: z.array(identifier),
  meta: z.object({ paths: z.array(z.array(identifier)) }).optional(),
})
const names = z.record(
  z.string(),
  z.object({
    name: z.string().nullable(),
    nameVariant: z.array(z.string()).nullable().optional(),
    nameAlts: z.array(z.string()).nullable().optional(),
    nameRules: z.array(z.unknown()).nullable().optional(),
  }),
)
/** Public JSON:API contract; normalize once at the API boundary for refresh consumers. */
export const geocodeSchema = z
  .object({
    jsonapi: z.object({ version: z.literal('1.1') }),
    data: z
      .array(
        z.object({
          type: z.literal('geocoding-results'),
          id: z.string(),
          attributes: z.object({
            status: z.enum(['resolved', 'ambiguous', 'incomplete', 'not_found']),
          }),
          relationships: z.record(z.string(), relationship),
        }),
      )
      .length(1),
    included: z.array(
      z.object({
        type: z.literal('divisions'),
        id: z.string(),
        attributes: z.object({
          category: z.string().nullable().optional(),
          class: z.string().nullable().optional(),
          level: z.number().int().min(0).max(6).nullable(),
          i18n: names,
        }),
      }),
    ),
    meta: z.object({ release: z.object({ apiReleaseSet: z.string() }) }),
  })
  .transform(response => {
    const result = response.data[0]
    const members = response.included.map(resource => ({
      id: resource.id,
      category: resource.attributes.category ?? null,
      class: resource.attributes.class ?? null,
      level: resource.attributes.level,
      names: resource.attributes.i18n,
    }))
    const referenced = new Set(
      Object.values(result.relationships).flatMap(value =>
        value.data.map(ref => ref.id),
      ),
    )
    if ([...referenced].some(id => !members.some(member => member.id === id)))
      throw new Error('DIVISION_GEOCODE_MISSING_MEMBERSHIP')
    const paths = (category: string): string[][] => {
      const relation = result.relationships[category]
      return relation
        ? (relation.meta?.paths ?? [relation.data]).map(path => path.map(ref => ref.id))
        : []
    }
    return {
      data: {
        status: result.attributes.status,
        memberships: members.filter(member => referenced.has(member.id)),
        selectedAncestryIds:
          result.attributes.status === 'ambiguous' ? null : [...referenced],
        path: null,
        landform: {
          memberships: members.filter(
            member => member.category === 'landform' && referenced.has(member.id),
          ),
          paths: paths('landform'),
        },
      },
      meta: response.meta,
    }
  })
export type Change = z.infer<typeof changeSchema>
export type GeocodeResponse = z.infer<typeof geocodeSchema>
export type Polygon = z.infer<typeof polygonSchema>
export type ApiOptions = { baseUrl: string; token?: string; fetcher?: typeof fetch }

/**
 * Reads a validated SaanSeoi response with a deadline and bounded body.
 * @param options API origin and optional credential.
 * @param path Endpoint path.
 * @param params Explicit release and query selectors.
 * @param schema Expected wire contract.
 * @returns Validated response; errors remain retryable by the durable job.
 */
export async function apiRead<T>(
  options: ApiOptions,
  path: string,
  params: Record<string, string>,
  schema: z.ZodType<T>,
): Promise<T> {
  const url = new URL(path, options.baseUrl)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const response = await (options.fetcher ?? fetch)(url, {
    signal: AbortSignal.timeout(15000),
    headers: options.token ? { 'x-api-key': options.token } : {},
    redirect: 'error',
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`SAANSEOI_HTTP_${response.status}`)
  }
  if (!response.body) throw new Error('SAANSEOI_EMPTY_RESPONSE')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.byteLength
      if (length > 8 * 1024 * 1024) throw new Error('SAANSEOI_RESPONSE_TOO_LARGE')
      chunks.push(part.value)
    }
  } finally {
    await reader.cancel()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return schema.parse(JSON.parse(new TextDecoder().decode(bytes)))
}

/**
 * Tests polygon coverage, including boundaries and excluding hole interiors.
 * @param point WGS84 longitude and latitude.
 * @param geometry Authoritative stub geometry.
 * @returns Whether any polygon covers the point.
 */
export function covers(point: number[], geometry: Polygon): boolean {
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.some(rings => {
    const exterior = ringLocation(point, rings[0])
    if (exterior === 0) return true
    if (exterior < 0) return false
    for (const hole of rings.slice(1)) {
      const location = ringLocation(point, hole)
      if (location === 0) return true
      if (location > 0) return false
    }
    return true
  })
}

/**
 * Classifies a point relative to a ring using ray crossing.
 * @param point Longitude and latitude.
 * @param vertices Closed ring vertices.
 * @returns Negative outside, zero on boundary, positive inside.
 */
function ringLocation([x, y]: number[], vertices: number[][]): number {
  let inside = false
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [ax, ay] = vertices[j],
      [bx, by] = vertices[i]
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax)
    if (
      Math.abs(cross) < 1e-12 &&
      x >= Math.min(ax, bx) &&
      x <= Math.max(ax, bx) &&
      y >= Math.min(ay, by) &&
      y <= Math.max(ay, by)
    )
      return 0
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax)
      inside = !inside
  }
  return inside ? 1 : -1
}

/**
 * Computes a conservative envelope for spatial candidate selection.
 * @param geometries Authoritative polygons.
 * @returns West, south, east, north, or null for no polygon.
 */
export function bounds(geometries: Polygon[]): number[] | null {
  let west = Infinity,
    south = Infinity,
    east = -Infinity,
    north = -Infinity
  for (const geometry of geometries) {
    const polygons =
      geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    for (const polygon of polygons)
      for (const ring of polygon)
        for (const [x, y] of ring) {
          west = Math.min(west, x)
          south = Math.min(south, y)
          east = Math.max(east, x)
          north = Math.max(north, y)
        }
  }
  return west === Infinity ? null : [west, south, east, north]
}
