// NODE
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'
// DATABASE
import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'
// SOURCE
import { mirrorSourceSubset } from './lib/mirror-source-subset'
import { readMirrorCheckpoint } from './lib/mirror-checkpoint'
import { parseLocationPublication } from '../../src/lib/locations/publication'
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
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      'source-export': { type: 'string' },
      'current-export': { type: 'string' },
    },
  })
  const [publicationPath, checkpointPath, taxonomyPrimary] = positionals
  if (!publicationPath || !checkpointPath || positionals.length > 3)
    throw new Error(
      'Usage: mirror-source.ts publication-response.json checkpoint.json [taxonomyPrimary] [--source-export DIRECTORY --current-export CURRENT.sqlite]',
    )
  if (Boolean(values['source-export']) !== Boolean(values['current-export']))
    throw new Error('Local source requires both --source-export and --current-export')
  if (process.env.HYPE_DEV_STATE)
    throw new Error('Use the default remirrored local HYPE database')
  process.umask(0o077)
  const publication = JSON.parse(readFileSync(publicationPath, 'utf8'))
  const { pin } = parseLocationPublication(publication)
  const filters = taxonomyPrimary ? { taxonomyPrimary } : {}
  const checkpoint = readMirrorCheckpoint(
    existsSync(checkpointPath)
      ? JSON.parse(readFileSync(checkpointPath, 'utf8'))
      : undefined,
    pin,
    filters,
  )
  const apiKey = process.env.SAANSEOI_API_KEY ?? process.env.VITE_SAANSEOI_API_KEY
  if (!values['source-export'] && !apiKey) throw new Error('SaanSeoi API key required')
  let source:
    | ReturnType<typeof import('./lib/local-source-api').openLocalSourceApi>
    | undefined
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>> | undefined
  try {
    // Load the sibling API only when explicit sealed local source exports are supplied.
    if (values['source-export'] && values['current-export']) {
      const { openLocalSourceApi } = await import('./lib/local-source-api')
      source = openLocalSourceApi(values['source-export'], values['current-export'])
    }
    proxy = await getPlatformProxy<{ DB: D1Database }>({
      configPath: './wrangler.local.toml',
      remoteBindings: false,
    })
    const db = drizzle(proxy.env.DB) as Database
    await mirrorSourceSubset({
      db,
      client: source?.client ?? { baseUrl: 'https://api.saanseoi.hk', apiKey: apiKey!, fetch },
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
    try {
      await proxy?.dispose()
    } finally {
      source?.close()
    }
  }
}

if (import.meta.main) await main()
