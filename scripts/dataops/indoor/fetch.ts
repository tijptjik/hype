// NODE
import { mkdir, rename, statfs } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
// DOMAIN
import {
  layerNames,
  type IndoorData,
  type IndoorFeature,
} from '../../../src/lib/indoor/model'
import {
  MAX_MAP_BUNDLE_BYTES,
  validateMapBundle,
  type MapBundle,
} from '../../../src/lib/indoor/releases'
import { contentHash, sha256 } from './content'

// TOC: Snapshot contract | Paginated transport | Atomic snapshot collection
export type Target = 'local' | 'prod'
export type Dataset = 'mtr' | 'buildings'
export type FetchRequest = (
  url: URL,
  options: { signal: AbortSignal },
) => Promise<Response>
export type Entry = {
  venueId: string
  bundle: string
  hash: string
  contentHash: string
  error?: string
}
export type Snapshot = {
  schemaVersion: 1
  target: Target
  dataset: Dataset
  fetchedAt: string
  inventoryIds: string[]
  entries: Entry[]
}

/** Check both upstream pagination conventions. @param total Initial total. @param offset Consumed records. @param reported Response total. @returns Original total. */
export function pageTotal(
  total: number | undefined,
  offset: number,
  reported: number,
): number {
  if (
    !Number.isSafeInteger(reported) ||
    reported < 0 ||
    (total !== undefined && reported !== total && reported !== total - offset)
  )
    throw new Error('Source count changed while paging')
  return total ?? reported
}

/** Retrieve complete pages and retain original response bytes.
 * @param dataset Source family. @param layer Source layer. @param venueIds Optional exact identities. @param archive Raw page callback. @param request Injectable HTTP transport. @returns Complete unique features.
 */
export async function fetchLayer(
  dataset: Dataset,
  layer: (typeof layerNames)[number],
  venueIds: string[],
  archive: (raw: Uint8Array, url: string) => Promise<void>,
  request: FetchRequest = fetch,
): Promise<IndoorFeature[]> {
  const features: IndoorFeature[] = [],
    seen = new Set<string>()
  const idField = `${layer.split('_')[0]}_id`
  let total: number | undefined
  do {
    const url = new URL(
      `https://mapapi.hkmapservice.gov.hk/ogc/wfs/indoor/${dataset === 'mtr' ? 'mtr_' : ''}${layer}`,
    )
    url.search = new URLSearchParams({
      service: 'WFS',
      version: '1.1.0',
      request: 'GetFeature',
      outputFormat: 'application/json',
      srsName: 'EPSG:4326',
      sortBy: idField,
      maxFeatures: '5000',
      startIndex: String(features.length),
      ...(venueIds.length
        ? { cql_filter: `venue_id IN (${venueIds.map(id => `'${id}'`).join(',')})` }
        : {}),
    }).toString()
    let raw: Uint8Array | undefined
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await request(url, { signal: AbortSignal.timeout(60000) })
        if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`)
        raw = new Uint8Array(await response.arrayBuffer())
        break
      } catch (error) {
        if (attempt === 3) throw error
        await Bun.sleep(1000 * 2 ** attempt)
      }
    }
    if (!raw) throw new Error('Missing upstream response')
    const page = JSON.parse(new TextDecoder().decode(raw))
    if (page.type !== 'FeatureCollection' || !Array.isArray(page.features))
      throw new Error('Invalid source collection')
    total = pageTotal(total, features.length, Number(page.totalFeatures))
    if (!page.features.length && features.length < total)
      throw new Error('Truncated source page')
    for (const feature of page.features) {
      const id = feature.properties?.[idField]
      if (typeof id !== 'string' || !id || seen.has(id))
        throw new Error('Missing or duplicate source identity')
      if (venueIds.length && !venueIds.includes(feature.properties.venue_id))
        throw new Error('Unexpected source venue')
      seen.add(id)
      features.push(feature)
    }
    if (features.length > total) throw new Error('Source count exceeded')
    await archive(raw, url.href)
  } while (features.length < total)
  return features
}

/** Write a fresh complete source snapshot; invalid geometry is retained and reported, never silently removed.
 * @param dataset Source family. @param target Destination environment. @param directory New immutable snapshot directory. @returns Snapshot manifest.
 */
export async function fetchSnapshot(
  dataset: Dataset,
  target: Target,
  directory: string,
): Promise<Snapshot> {
  await mkdir(directory, { recursive: false })
  await mkdir(resolve(directory, 'raw'))
  await mkdir(resolve(directory, 'bundles'))
  const pages: { path: string; sha256: string; url: string }[] = []
  const archive = async (raw: Uint8Array, url: string): Promise<void> => {
    const hash = sha256(raw),
      path = `raw/${hash}.json.gz`
    await Bun.write(resolve(directory, path), gzipSync(raw))
    pages.push({ path, sha256: hash, url })
  }
  const inventory = await fetchLayer(dataset, 'venue_polygon', [], archive)
  const ids = inventory.map(f => String(f.properties.venue_id))
  if (!ids.length || ids.some(id => !/^[a-f0-9-]{36}$/i.test(id)))
    throw new Error('Invalid venue inventory')
  const snapshot: Snapshot = {
    schemaVersion: 1,
    target,
    dataset,
    fetchedAt: new Date().toISOString(),
    inventoryIds: ids,
    entries: [],
  }
  // Bounded batches reduce upstream requests without mixing identities in the derived bundles.
  for (let offset = 0; offset < ids.length; offset += 8) {
    const space = await statfs(directory)
    if (Number(space.bavail) * Number(space.bsize) < 1024 ** 3)
      throw new Error('Less than 1 GiB free; collection stopped')
    const group = ids.slice(offset, offset + 8)
    const layers = Object.fromEntries(
      await Promise.all(
        layerNames.map(async layer => [
          layer,
          await fetchLayer(dataset, layer, group, archive),
        ]),
      ),
    )
    for (const venueId of group) {
      const bundle: MapBundle = {
        schemaVersion: 1,
        documents: [],
        data: {
          ...(Object.fromEntries(
            layerNames.map(layer => [
              layer,
              {
                type: 'FeatureCollection',
                features: layers[layer].filter(
                  (f: IndoorFeature) => f.properties.venue_id === venueId,
                ),
              },
            ]),
          ) as Pick<IndoorData, (typeof layerNames)[number]>),
          retrievedAt: snapshot.fetchedAt,
          connections: [],
          sourceDataset: dataset === 'mtr' ? 'landsd-mtr' : 'landsd-building',
        },
      }
      const text = JSON.stringify(bundle),
        path = `bundles/${venueId}.json.gz`
      await Bun.write(resolve(directory, path), gzipSync(text))
      const entry: Entry = {
        venueId,
        bundle: path,
        hash: sha256(text),
        contentHash: contentHash(bundle),
      }
      try {
        validateMapBundle(bundle)
      } catch (error) {
        entry.error = String(error)
      }
      snapshot.entries.push(entry)
    }
    console.log(`Fetched ${snapshot.entries.length}/${ids.length} ${dataset}`)
  }
  await Bun.write(resolve(directory, 'pages.json'), JSON.stringify(pages, null, 2))
  await Bun.write(resolve(directory, 'snapshot.tmp'), JSON.stringify(snapshot, null, 2))
  await rename(resolve(directory, 'snapshot.tmp'), resolve(directory, 'snapshot.json'))
  return snapshot
}

/** Read and verify a retained venue bundle. @param directory Snapshot directory. @param entry Manifest entry. @returns Exact source bundle. */
export async function readEntry(directory: string, entry: Entry): Promise<MapBundle> {
  const path = resolve(directory, entry.bundle)
  if (!path.startsWith(`${resolve(directory)}/`))
    throw new Error('Bundle outside snapshot')
  const raw = gunzipSync(await Bun.file(path).bytes())
  if (raw.length > MAX_MAP_BUNDLE_BYTES)
    throw new Error('Source map exceeds the publication size limit')
  if (sha256(raw) !== entry.hash) throw new Error('Snapshot hash mismatch')
  const bundle = JSON.parse(raw.toString()) as MapBundle
  if (
    contentHash(bundle) !== entry.contentHash ||
    bundle.data.venue_polygon.features.length !== 1 ||
    bundle.data.venue_polygon.features[0].properties.venue_id !== entry.venueId
  )
    throw new Error('Snapshot content identity mismatch')
  return bundle
}
