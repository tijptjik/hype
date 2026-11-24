// NODE
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
// CLOUDFLARE
import { getPlatformProxy } from 'wrangler'
// RELEASE
import manifest from './unison-assets.json' with { type: 'json' }
// TYPES
import type { R2Bucket } from '@cloudflare/workers-types'

// Stage the R2 dependencies of migration 0270. The default invocation is read-only.
const prefix = `location-exteriors/${manifest.assetId}/`
const descriptors = ['assembly.gltf', 'assembly.json']

/**
 * Read and verify immutable object bytes.
 * @param bucket Source or destination bucket.
 * @param file Filename inside the asset.
 * @param expected SHA-256 from the reviewed release.
 * @returns Bytes, or null for a missing key.
 */
async function read(
  bucket: R2Bucket,
  file: string,
  expected: string,
): Promise<ArrayBuffer | null> {
  const object = await bucket.get(prefix + file)
  if (!object) return null
  const bytes = await object.arrayBuffer()
  if (createHash('sha256').update(new Uint8Array(bytes)).digest('hex') !== expected)
    throw new Error(`Unexpected contents at ${object.key}`)
  return bytes
}

/** Check the complete release before copying missing original government files.
 * @param source Private development originals bucket.
 * @param destination Private production originals bucket.
 * @param apply Create missing originals if true.
 * @returns Number of original objects missing at preflight.
 */
export async function stageUnisonAssets(
  source: R2Bucket,
  destination: R2Bucket,
  apply: boolean,
): Promise<number> {
  for (const [file, hash] of Object.entries(manifest.comparison)) {
    if (!(await read(destination, file, hash)))
      throw new Error(`Missing uploaded comparison object: ${file}`)
  }
  const pending = []
  for (const [file, hash] of Object.entries(manifest.assembly)) {
    if (await read(destination, file, hash)) continue
    const bytes = await read(source, file, hash)
    if (!bytes) throw new Error(`Missing government source: ${file}`)
    pending.push({ file, hash, bytes })
  }
  if (apply) {
    // Publish the manifest last so every file it references is available.
    for (const { file, hash, bytes } of pending.sort(
      (a, b) => descriptors.indexOf(a.file) - descriptors.indexOf(b.file),
    )) {
      const contentType = file.endsWith('.gltf')
        ? 'model/gltf+json'
        : file.endsWith('.json')
          ? 'application/json'
          : file.endsWith('.jpg')
            ? 'image/jpeg'
            : 'application/octet-stream'
      await destination.put(prefix + file, bytes, {
        onlyIf: { etagDoesNotMatch: '*' },
        httpMetadata: { contentType },
      })
      if (!(await read(destination, file, hash)))
        throw new Error(`Missing after upload: ${file}`)
    }
  }
  return pending.length
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  if (args.length && (args.length !== 1 || args[0] !== '--apply'))
    throw new Error(
      'Usage: node scripts/locations/exterior/stage-unison-assets.ts [--apply]',
    )
  const apply = args[0] === '--apply'
  const proxy = await getPlatformProxy<{
    ASSET_RAW_DEV: R2Bucket
    ASSET_RAW_PRODUCTION: R2Bucket
  }>({
    configPath: 'wrangler.toml',
    environment: 'production',
    remoteBindings: true,
    persist: false,
  })
  try {
    const count = await stageUnisonAssets(
      proxy.env.ASSET_RAW_DEV,
      proxy.env.ASSET_RAW_PRODUCTION,
      apply,
    )
    console.log(
      apply
        ? `Verified production package. Staged ${count} missing originals.`
        : `Verified comparison and government source bytes. ${count} originals require staging in production.`,
    )
  } finally {
    await proxy.dispose()
  }
}
