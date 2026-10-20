// NODE
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
// DATABASE
import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { placeRevision } from '../../src/lib/db/schema/place'
import { persistForwardSaanSeoiPlace } from '../../src/lib/db/services/placeSource'
// SOURCE
import { readSaanSeoiPlacePage } from '../../src/lib/places/sourceClient'
import { hydrateSaanSeoiPlaceAddress } from '../../src/lib/places/sourceAddress'
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
  let checkpoint = readMirrorCheckpoint(
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
    // Older receipts and reset local databases must replay instead of claiming completion.
    let receiptsPresent =
      Array.isArray(checkpoint.revisions) &&
      checkpoint.revisions.length === checkpoint.offset
    if (receiptsPresent) {
      for (const id of checkpoint.revisions) {
        if (
          !(await db
            .select({ id: placeRevision.id })
            .from(placeRevision)
            .where(eq(placeRevision.id, id))
            .get())
        ) {
          receiptsPresent = false
          break
        }
      }
    }
    if (!receiptsPresent)
      checkpoint = {
        version: 2,
        pin,
        filters,
        offset: 0,
        total: null,
        complete: false,
        revisions: [],
      }
    if (checkpoint.complete) {
      console.log('Source subset already mirrored and verified', {
        total: checkpoint.total,
      })
      return
    }
    const client = { baseUrl: 'https://api.saanseoi.hk', apiKey, fetch }
    while (!checkpoint.complete) {
      const page = await readSaanSeoiPlacePage(client, pin, checkpoint.offset, filters)
      if (
        checkpoint.total !== null &&
        page.total !== null &&
        checkpoint.total !== page.total
      )
        throw new Error('Pinned publication total changed')
      const revisions = [...checkpoint.revisions]
      for (const projection of page.places) {
        // Persist native Address evidence before recording successful mirror progress.
        const hydrated = await hydrateSaanSeoiPlaceAddress(client, projection)
        const receipt = await persistForwardSaanSeoiPlace(db, hydrated)
        if (revisions.includes(receipt.revisionId))
          throw new Error('Duplicate Place across source pages')
        revisions.push(receipt.revisionId)
      }
      const processed = checkpoint.offset + page.places.length
      if (
        page.nextOffset === null &&
        checkpoint.total !== null &&
        checkpoint.total !== processed
      )
        throw new Error('Pinned publication ended before its retained total')
      // Advance only after the whole page has persisted; interrupted pages are safe to replay.
      checkpoint = {
        ...checkpoint,
        revisions,
        total:
          page.total ??
          checkpoint.total ??
          (page.nextOffset === null ? processed : null),
        offset: processed,
        complete: page.nextOffset === null,
      }
      mkdirSync(dirname(checkpointPath), { recursive: true })
      writeFileSync(
        checkpointPath + '.tmp',
        JSON.stringify(checkpoint, null, 2) + '\n',
        { mode: 0o600 },
      )
      renameSync(checkpointPath + '.tmp', checkpointPath)
      console.log('Mirrored source page', {
        processed: checkpoint.offset,
        total: checkpoint.total,
        complete: checkpoint.complete,
      })
    }
  } finally {
    await proxy.dispose()
  }
}

if (import.meta.main) await main()
