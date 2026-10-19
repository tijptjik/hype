// NODE
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
// DATABASE
import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { placeRevision } from '../../src/lib/db/schema/place'
import { persistSaanSeoiPlace } from '../../src/lib/db/services/placeSource'
// SOURCE
import { readSaanSeoiPlacePage } from '../../src/lib/places/sourceClient'
// TYPES
import type { PlacePublicationPin } from '../../src/lib/places/sourceClient'
import type { Database } from '../../src/lib/types'
import type { D1Database } from '@cloudflare/workers-types'

type Checkpoint = {
  version: 1
  pin: PlacePublicationPin
  filters: { taxonomyPrimary?: string }
  offset: number
  total: number | null
  complete: boolean
  revisions: string[]
}

/**
 * Mirror a pinned source subset into LOCAL HYPE, checkpointing completed pages only.
 * @returns Completion when every canonical page has been stored without changing Features.
 * @remarks No remote target switch exists. Source credentials are never written to receipts.
 * Rerunning after failure replays at most one page using idempotent revision persistence.
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
  const permalink = new URL(publication.links.permalink)
  const knownAt = permalink.searchParams.get('knownAt')
  if (!knownAt) throw new Error('Publication permalink must pin knownAt')
  const pin: PlacePublicationPin = {
    releaseSet: publication.meta.apiReleaseSet,
    catalogRevision: publication.meta.apiCatalogRevision,
    knownAt,
  }
  const filters = taxonomyPrimary ? { taxonomyPrimary } : {}
  let checkpoint: Checkpoint = existsSync(checkpointPath)
    ? JSON.parse(readFileSync(checkpointPath, 'utf8'))
    : {
        version: 1,
        pin,
        filters,
        offset: 0,
        total: null,
        complete: false,
        revisions: [],
      }
  if (
    checkpoint.version !== 1 ||
    JSON.stringify(checkpoint.pin) !== JSON.stringify(pin) ||
    JSON.stringify(checkpoint.filters) !== JSON.stringify(filters)
  )
    throw new Error('Checkpoint belongs to another publication or source subset')
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
        version: 1,
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
    while (!checkpoint.complete) {
      const page = await readSaanSeoiPlacePage(
        { baseUrl: 'https://api.saanseoi.hk', apiKey, fetch },
        pin,
        checkpoint.offset,
        filters,
      )
      if (checkpoint.total !== null && checkpoint.total !== page.total)
        throw new Error('Pinned publication total changed')
      const revisions = [...checkpoint.revisions]
      for (const projection of page.places) {
        const receipt = await persistSaanSeoiPlace(db, projection)
        if (revisions.includes(receipt.revisionId))
          throw new Error('Duplicate Place across source pages')
        revisions.push(receipt.revisionId)
      }
      // Advance only after the whole page has persisted; interrupted pages are safe to replay.
      checkpoint = {
        ...checkpoint,
        revisions,
        total: page.total,
        offset: page.nextOffset ?? page.total,
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
