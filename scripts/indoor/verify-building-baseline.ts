// NODE
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { gunzipSync } from 'node:zlib'
// DOMAIN
import { layerNames } from '../../src/lib/indoor/model'
import {
  MAX_MAP_BUNDLE_BYTES,
  mapIdSchema,
  validateMapBundle,
} from '../../src/lib/indoor/releases'

const root = resolve(process.argv[2])
const index = JSON.parse(readFileSync(resolve(root, 'index.json'), 'utf8'))
const inventory = JSON.parse(
  readFileSync(resolve(root, 'venue-inventory.json'), 'utf8'),
)
const collection = JSON.parse(readFileSync(resolve(root, 'collection.json'), 'utf8'))
if (index.length !== inventory.totalFeatures || collection.failures.length)
  throw new Error('Incomplete building collection')
const checked = new Map<string, { hash: string; counts: Map<string, number> }>()
const identities = new Set<string>()
const failures: { id: string; error: string }[] = []
let units = 0,
  levels = 0,
  bytes = 0
for (const entry of index) {
  try {
    mapIdSchema.parse(entry.id)
    if (entry.code !== entry.code.toUpperCase() || identities.has(entry.id))
      throw new Error('Duplicate map or invalid registry code')
    identities.add(entry.id)
    const manifest = JSON.parse(
      readFileSync(resolve(entry.sourceDirectory, 'manifest.json'), 'utf8'),
    )
    // Shared batch pages are checked once, while every derived venue bundle is validated separately.
    const expectedCounts = new Map<string, number>()
    for (const page of manifest.pages) {
      const path = resolve(entry.sourceDirectory, page.path)
      if (!path.startsWith(`${root}/`)) throw new Error('Source page outside baseline')
      if (!checked.has(path)) {
        const stored = readFileSync(path)
        const raw = path.endsWith('.gz') ? gunzipSync(stored) : stored
        const counts = new Map<string, number>()
        for (const feature of JSON.parse(raw.toString('utf8')).features) {
          const venue = feature.properties.venue_id
          counts.set(venue, (counts.get(venue) ?? 0) + 1)
        }
        checked.set(path, {
          hash: createHash('sha256').update(raw).digest('hex'),
          counts,
        })
      }
      const verified = checked.get(path)
      if (verified?.hash !== page.sha256) throw new Error('Source page hash changed')
      const layer = layerNames.find(name => basename(path).startsWith(name))
      if (!layer) throw new Error('Unknown source layer')
      expectedCounts.set(
        layer,
        (expectedCounts.get(layer) ?? 0) + (verified.counts.get(entry.venueId) ?? 0),
      )
    }
    const stored = readFileSync(entry.bundle)
    const raw = entry.bundle.endsWith('.gz') ? gunzipSync(stored) : stored
    if (createHash('sha256').update(raw).digest('hex') !== manifest.bundleHash)
      throw new Error('Derived source bundle changed')
    const bundle = validateMapBundle(JSON.parse(raw.toString('utf8')))
    if (
      bundle.data.venue_polygon.features.length !== 1 ||
      bundle.data.venue_polygon.features[0].properties.venue_id !== entry.venueId
    )
      throw new Error('Source venue mismatch')
    for (const layer of layerNames) {
      if (bundle.data[layer].features.length !== expectedCounts.get(layer))
        throw new Error(`Source count mismatch: ${layer}`)
    }
    if (raw.length > MAX_MAP_BUNDLE_BYTES)
      throw new Error('Bundle exceeds publication limit')
    units += bundle.data.unit_polygon.features.length
    levels += bundle.data.level_polygon.features.length
    bytes += raw.length
  } catch (error) {
    failures.push({ id: entry.id, error: String(error) })
  }
}
console.log(
  JSON.stringify(
    {
      buildings: index.length,
      sourcePages: checked.size,
      levels,
      units,
      bytes,
      failures,
    },
    null,
    2,
  ),
)
if (failures.length) process.exitCode = 1
