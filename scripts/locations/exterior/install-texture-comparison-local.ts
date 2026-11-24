// NODE
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
// CLOUDFLARE
import { getPlatformProxy } from 'wrangler'
// TYPES
import type { D1Database, R2Bucket } from '@cloudflare/workers-types'

const [locationId, assetId, modelPath, provenancePath] = process.argv.slice(2)
if (
  !locationId ||
  !/^[0-9a-f-]{36}$/.test(assetId ?? '') ||
  !modelPath ||
  !provenancePath
)
  throw new Error(
    'Expected LOCATION_ID CURRENT_ASSET_ID COMPARISON.glb PROVENANCE.json',
  )
const model = await readFile(modelPath)
if (
  model.toString('ascii', 0, 4) !== 'glTF' ||
  model.readUInt32LE(4) !== 2 ||
  model.readUInt32LE(8) !== model.length
)
  throw new Error('Invalid comparison GLB.')
const document = JSON.parse(model.toString('utf8', 20, 20 + model.readUInt32LE(12)))
if (!document.extras?.exteriorTextureLayers?.length)
  throw new Error('This GLB has no registered exterior texture layers.')
const provenance = JSON.parse(await readFile(provenancePath, 'utf8'))
const revision = createHash('sha256').update(model).digest('hex')
const file = 'comparison-' + revision + '.glb'
const prefix = `location-exteriors/${assetId}/`
const proxy = await getPlatformProxy<{ DB: D1Database; ASSET_RAW_DEV: R2Bucket }>({
  configPath: 'wrangler.local.toml',
  remoteBindings: false,
  ...(process.env.HYPE_DEV_STATE
    ? { persist: { path: process.env.HYPE_DEV_STATE } }
    : {}),
})
try {
  const db = proxy.env.DB
  const source = await db
    .prepare('SELECT assetId FROM locationExteriorModel WHERE locationId=?')
    .bind(locationId)
    .first<{ assetId: string }>()
  if (source?.assetId !== assetId)
    throw new Error('Current government revision does not match.')
  const bucket = proxy.env.ASSET_RAW_DEV
  // Stage immutable bytes and evidence before making the revision discoverable by this viewer.
  await bucket.put(prefix + file, model, {
    httpMetadata: { contentType: 'model/gltf-binary' },
    onlyIf: { etagDoesNotMatch: '*' },
  })
  const evidence = JSON.stringify({
    sourceAssetId: assetId,
    locationId,
    revision,
    file,
    provenance,
  })
  const evidenceHash = createHash('sha256').update(evidence).digest('hex')
  const evidenceFile = 'provenance-' + evidenceHash + '.json'
  await bucket.put(prefix + evidenceFile, evidence, {
    httpMetadata: { contentType: 'application/json' },
    onlyIf: { etagDoesNotMatch: '*' },
  })
  await bucket.put(
    prefix + 'texture-comparison.json',
    JSON.stringify({ file, evidenceFile }),
    { httpMetadata: { contentType: 'application/json' } },
  )
  console.log(JSON.stringify({ locationId, assetId, revision, file, evidenceFile }))
} finally {
  await proxy.dispose()
}
