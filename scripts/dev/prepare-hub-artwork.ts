// NODE
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
// CLOUDFLARE
import { getPlatformProxy } from 'wrangler'
// TYPES
import type { R2Bucket } from '@cloudflare/workers-types'

type Card = { code: string; file: string; sha: string; key: string }

/**
 * Makes the approved hub originals available to the simulated local asset worker.
 * @returns Resolves after every local object has been verified.
 * @remarks Never contacts remote R2 or changes database assignments. Existing objects
 * with different bytes are rejected; the production namespace is simulated locally.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.some(arg => arg !== '--apply') || args.length > 1)
    throw new Error('Usage: bun run scripts/dev/prepare-hub-artwork.ts [--apply]')
  const apply = args.includes('--apply')
  const root = resolve(import.meta.dir, '../..')
  const directory = resolve(root, 'docs/design/hub-title-cards/v2')
  const receipt = JSON.parse(
    await readFile(resolve(directory, 'upload-receipt.json'), 'utf8'),
  )
  const dimgaai = JSON.parse(
    await readFile(resolve(directory, 'dimgaai-upload-receipt.json'), 'utf8'),
  )
  const cards: Card[] = [...receipt.cards, dimgaai.card]

  // Validate the entire approved set before opening or mutating local storage.
  const originals = await Promise.all(
    cards.map(async card => {
      if (
        !card.key.startsWith('h/hubs/') ||
        !card.file.startsWith('docs/design/hub-title-cards/v2/')
      )
        throw new Error(`Unexpected artwork receipt: ${card.code}`)
      const bytes = await readFile(resolve(root, card.file))
      if (createHash('sha256').update(bytes).digest('hex') !== card.sha)
        throw new Error(`Artwork source hash mismatch: ${card.code}`)
      return { card, bytes }
    }),
  )
  const proxy = await getPlatformProxy<{ ASSET_RAW_PRODUCTION: R2Bucket }>({
    configPath: resolve(root, 'workers/asset-service/wrangler.local.toml'),
    remoteBindings: false,
    // The CLI appends v3 to --persist-to; getPlatformProxy expects that final path.
    persist: { path: resolve(root, '.wrangler/state/asset-service/v3') },
  })
  try {
    const bucket = proxy.env.ASSET_RAW_PRODUCTION
    const missing: typeof originals = []
    // Check existing bytes first so a conflict cannot leave a partially restored set.
    for (const original of originals) {
      const object = await bucket.get(original.card.key)
      if (!object) {
        missing.push(original)
      } else if (
        createHash('sha256')
          .update(new Uint8Array(await object.arrayBuffer()))
          .digest('hex') !== original.card.sha
      ) {
        throw new Error(`Existing local artwork differs: ${original.card.code}`)
      }
    }
    if (apply) {
      for (const { card, bytes } of missing) {
        await bucket.put(card.key, bytes, {
          httpMetadata: { contentType: 'image/png' },
        })
      }
      // Read back persisted originals; a successful put alone is not restoration proof.
      for (const { card } of originals) {
        const object = await bucket.get(card.key)
        if (
          !object ||
          createHash('sha256')
            .update(new Uint8Array(await object.arrayBuffer()))
            .digest('hex') !== card.sha
        )
          throw new Error(`Local artwork verification failed: ${card.code}`)
      }
    }
    console.info(
      JSON.stringify(
        {
          mode: apply ? 'applied' : 'plan',
          storage: 'simulated local hype-assets-raw-prod',
          cards: cards.map(card => card.code),
          missing: missing.map(({ card }) => card.code),
          verified: apply ? originals.length : originals.length - missing.length,
        },
        null,
        2,
      ),
    )
  } finally {
    await proxy.dispose()
  }
}

await main()
