// DATABASE
import { eq } from 'drizzle-orm'
import { placeRevision } from '../../../src/lib/db/schema/place'
import { persistForwardSaanSeoiPlace } from '../../../src/lib/db/services/placeSource'
// SOURCE
import { readSaanSeoiPlacePage } from '../../../src/lib/places/sourceClient'
import { hydrateSaanSeoiPlaceAddress } from '../../../src/lib/places/sourceAddress'
// TYPES
import type { Database } from '../../../src/lib/types'
import type { PlaceSourceClient } from '../../../src/lib/places/sourceClient'
import type { MirrorCheckpoint } from './mirror-checkpoint'

/**
 * Mirror a pinned subset through source hydration and forward-only persistence.
 * @param input Explicit local database, source transport, validated checkpoint and durable page sink.
 * @returns Completed checkpoint only after all page receipts have persisted.
 * @remarks A failed page never advances its checkpoint. Retry replays its writes using
 * immutable revision identities. No Feature association or effective value is changed.
 */
export async function mirrorSourceSubset(input: {
  db: Database
  client: PlaceSourceClient
  checkpoint: MirrorCheckpoint
  saveCheckpoint: (checkpoint: MirrorCheckpoint) => void | Promise<void>
  report: (progress: {
    processed: number
    total: number | null
    complete: boolean
  }) => void
}): Promise<MirrorCheckpoint> {
  const { db, client, saveCheckpoint, report } = input
  let checkpoint = input.checkpoint
  const { pin, filters } = checkpoint
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
    report({ processed: checkpoint.offset, total: checkpoint.total, complete: true })
    return checkpoint
  }
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
        page.total ?? checkpoint.total ?? (page.nextOffset === null ? processed : null),
      offset: processed,
      complete: page.nextOffset === null,
    }
    await saveCheckpoint(checkpoint)
    report({
      processed: checkpoint.offset,
      total: checkpoint.total,
      complete: checkpoint.complete,
    })
  }
  return checkpoint
}
