// NODE
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
// DATABASE
import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'
// SOURCE
import { mirrorSourceSubset } from './lib/mirror-source-subset'
import { readMirrorCheckpoint } from './lib/mirror-checkpoint'
import { parsePlacePublication } from '../../src/lib/places/publication'
// TYPES
import type { Database } from '../../src/lib/types'
import type { D1Database } from '@cloudflare/workers-types'

/**
 * Mirror a pinned source subset into LOCAL HYPE, checkpointing completed pages only.
 * @returns Completion when every canonical page has been stored without changing Features.
 * @remarks No remote target switch exists. Source credentials are never written to receipts.
 * Rerunning after failure replays at most one page using idempotent revision persistence.
 * Version-one checkpoints replay once because their records may lack Address hydration.
 */
async function main(): Promise<void> {
  const [publicationPath, checkpointPath, taxonomyPrimary] = process.argv.slice(2)
  if (!publicationPath || !checkpointPath)
    throw new Error(
      'Usage: mirror-source.ts publication-response.json checkpoint.json [taxonomyPrimary]',
    )
  if (process.env.HYPE_DEV_STATE)
    throw new Error('Use the default remirrored local HYPE database')
  process.umask(0o077)
  const publication = JSON.parse(readFileSync(publicationPath, 'utf8'))
  const { pin } = parsePlacePublication(publication)
  const filters = taxonomyPrimary ? { taxonomyPrimary } : {}
  const checkpoint = readMirrorCheckpoint(
    existsSync(checkpointPath)
      ? JSON.parse(readFileSync(checkpointPath, 'utf8'))
      : undefined,
    pin,
    filters,
  )
  const apiKey = process.env.SAANSEOI_API_KEY ?? process.env.VITE_SAANSEOI_API_KEY
  if (!apiKey) throw new Error('SaanSeoi API key required')
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: './wrangler.local.toml',
    remoteBindings: false,
  })
  try {
    const db = drizzle(proxy.env.DB) as Database
    await mirrorSourceSubset({
      db,
      client: { baseUrl: 'https://api.saanseoi.hk', apiKey, fetch },
      checkpoint,
      saveCheckpoint: next => {
        mkdirSync(dirname(checkpointPath), { recursive: true })
        writeFileSync(checkpointPath + '.tmp', JSON.stringify(next, null, 2) + '\n', {
          mode: 0o600,
        })
        renameSync(checkpointPath + '.tmp', checkpointPath)
      },
      report: progress => console.log('Mirrored source progress', progress),
    })
  } finally {
    await proxy.dispose()
  }
}

if (import.meta.main) await main()
