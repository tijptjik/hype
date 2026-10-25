// VALIDATION
import { z } from 'zod'
// SOURCES
import { sourceCache, SourceCache } from './cache.js'

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  family: z.string(),
  projection: z.string(),
  status: z.literal('ready'),
  apiReleaseSetId: z.string().nullable(),
  exportReleaseId: z.string().optional(),
  mock: z.boolean().optional(),
  recordCount: z.number().int().nonnegative(),
  files: z.array(
    z.object({
      format: z.string(),
      envelope: z.string(),
      href: z.string(),
      recordCount: z.number().int().nonnegative(),
      byteLength: z.number().int().nonnegative(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      minId: z.string().optional(),
      maxId: z.string().optional(),
    }),
  ),
})

/** Resolve the configurable public API origin, without credentials.
 * @returns Development or production origin; local HTTP origins are supported.
 */
export function saanseoiOrigin(): string {
  return (
    import.meta.env.PUBLIC_SAANSEOI_API_URL?.trim() ||
    (import.meta.env.DEV ? 'http://api.atlas.localhost' : 'https://api.saanseoi.hk')
  ).replace(/\/$/, '')
}

/** Fetch all JSON chunks atomically, verifying published checksums and counts.
 * @param manifestUrl Projection manifest, including its version/domain/variant.
 * @param schema Record validator.
 * @param fetcher Public transport; never forwards API credentials.
 * @returns Manifest provenance and the complete validated inventory.
 */
export async function fetchSaanseoiProjection<T extends { id: string }>(
  manifestUrl: string | URL,
  schema: z.ZodType<T>,
  fetcher: typeof fetch = fetch,
  options: { id?: string; release?: string } = {},
): Promise<{ manifest: z.infer<typeof manifestSchema>; records: T[] }> {
  const cache =
    fetcher === fetch
      ? sourceCache
      : new SourceCache({ read: async () => undefined, write: async () => {} })
  const url = new URL(manifestUrl)
  // Building search requires the release with points and addresses, not cached names-only exports.
  const manifestCacheVersion = url.pathname.startsWith('/buildings/')
    ? 'saanseoi-building-details-v1'
    : 'saanseoi-manifest-v2'
  const manifest = await cache.load(
    [manifestCacheVersion, url.href],
    value => manifestSchema.parse(value),
    async () => {
      const response = await fetcher(url, { credentials: 'omit' })
      if (!response.ok) throw new Error(`Source manifest: HTTP ${response.status}`)
      return manifestSchema.parse(await response.json())
    },
  )
  if (options.release && manifest.exportReleaseId !== options.release)
    throw new Error('Source release mismatch')
  if (!manifest.apiReleaseSetId && !manifest.exportReleaseId)
    throw new Error('Missing export release identity')
  const files = manifest.files.filter(
    file =>
      file.format === 'json' &&
      file.envelope === 'array' &&
      (!options.id ||
        (!!file.minId &&
          !!file.maxId &&
          options.id >= file.minId &&
          options.id <= file.maxId)),
  )
  if (!files.length) throw new Error('No JSON array representation')
  const records: T[] = []
  // Only expose data after every pinned chunk passes integrity and schema validation.
  for (const file of files) {
    const href = new URL(file.href, url)
    if (!['http:', 'https:'].includes(href.protocol) || href.username || href.password)
      throw new Error('Invalid source URL')
    const rows = await cache.load(
      ['saanseoi-chunk', href.href, file.sha256],
      value => z.array(z.unknown()).parse(value),
      async () => {
        const part = await fetcher(href, { credentials: 'omit' })
        if (!part.ok) throw new Error(`Source chunk: HTTP ${part.status}`)
        const bytes = await part.arrayBuffer()
        if (bytes.byteLength !== file.byteLength)
          throw new Error('Source byte count mismatch')
        const hash = Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
          byte => byte.toString(16).padStart(2, '0'),
        ).join('')
        if (hash !== file.sha256) throw new Error('Source checksum mismatch')
        const rows = z
          .array(z.unknown())
          .parse(JSON.parse(new TextDecoder().decode(bytes)))
        if (rows.length !== file.recordCount)
          throw new Error('Source chunk count mismatch')
        return rows
      },
    )
    records.push(...z.array(schema).parse(rows))
  }
  if (
    (!options.id && records.length !== manifest.recordCount) ||
    new Set(records.map(row => row.id)).size !== records.length
  )
    throw new Error('Source inventory mismatch')
  return {
    manifest,
    records: options.id ? records.filter(row => row.id === options.id) : records,
  }
}

export const sourceNameSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable().optional(),
  names: z.object({
    en: z.string().nullable(),
    'zh-Hant': z.string().nullable(),
    'zh-Hans': z.string().nullable(),
  }),
  divisionCodes: z.array(z.string()).default([]),
})

/** Load a reusable names projection with daily browser persistence.
 * @param family Public vocabulary family.
 * @returns Complete names records, retaining null translations and unclassified labels.
 */
export function loadSaanseoiNames(
  family: 'streets' | 'buildings',
): Promise<z.infer<typeof sourceNameSchema>[]> {
  if (family === 'buildings') return loadBuildingNames().then(result => result.records)
  const variant = 'saanseoi'
  const url = `${saanseoiOrigin()}/${family}/v0.1/exports/physical/${variant}/names/manifest.json`
  return sourceCache.load(
    ['saanseoi', url, 'names-v1'],
    value => z.array(sourceNameSchema).parse(value),
    async () => {
      const result = await fetchSaanseoiProjection(url, sourceNameSchema)
      if (result.manifest.family !== family || result.manifest.projection !== 'names')
        throw new Error('Unexpected source projection')
      return result.records
    },
  )
}

/** Load building names together with the exact release used for detail joins.
 * @returns Named inventory and its immutable export release identifier.
 */
export async function loadBuildingNames(): Promise<{
  records: z.infer<typeof sourceNameSchema>[]
  release: string
}> {
  const url = `${saanseoiOrigin()}/buildings/v0.1/exports/physical/overture/names/manifest.json`
  const result = await fetchSaanseoiProjection(url, sourceNameSchema)
  if (
    result.manifest.family !== 'buildings' ||
    result.manifest.projection !== 'names' ||
    !result.manifest.exportReleaseId
  )
    throw Error('Invalid building names projection')
  return { records: result.records, release: result.manifest.exportReleaseId }
}
export const buildingPointSchema = z.object({
  id: z.string(),
  coordinates: z.tuple([
    z.number().finite().min(-180).max(180),
    z.number().finite().min(-90).max(90),
  ]),
})
export const buildingAddressSchema = z.object({
  id: z.string(),
  snapshotId: z.string(),
  display: z.record(z.string(), z.string()),
  match: z.literal('point-in-footprint'),
})
export const buildingAddressesSchema = z.object({
  id: z.string(),
  addresses: z.array(buildingAddressSchema),
})
export type BuildingAddressCandidate = z.infer<typeof buildingAddressSchema>
export type BuildingDetails = {
  id: string
  coordinates: [number, number]
  addresses: BuildingAddressCandidate[]
}
/** Fetch only the ID-range shards containing a selected building, pinned to its names release.
 * @param id Building GERS identifier. @param release Names export release.
 * @returns Building interior point and all spatial address candidates.
 */
export async function loadBuildingDetails(
  id: string,
  release: string,
): Promise<BuildingDetails> {
  const base = `${saanseoiOrigin()}/buildings/v0.1/exports/physical/overture`
  const url = (projection: string) =>
    `${base}/${projection}/manifest.json?release=${encodeURIComponent(release)}`
  const [points, addresses] = await Promise.all([
    fetchSaanseoiProjection(url('points'), buildingPointSchema, fetch, { id, release }),
    fetchSaanseoiProjection(url('addresses'), buildingAddressesSchema, fetch, {
      id,
      release,
    }),
  ])
  if (
    points.manifest.family !== 'buildings' ||
    points.manifest.projection !== 'points' ||
    addresses.manifest.family !== 'buildings' ||
    addresses.manifest.projection !== 'addresses' ||
    points.records.length !== 1 ||
    addresses.records.length !== 1
  )
    throw Error('Incomplete building projections')
  return { ...points.records[0], addresses: addresses.records[0].addresses }
}
