// TYPES
import type { R2Bucket, R2Object } from '@cloudflare/workers-types'
import type { MapRenderJob } from './render.types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. LAST SUCCESSFUL RENDER
//    - findLastSuccessfulMapRender
// 2. MISSING RENDER REPAIR
//    - enqueueMissingMapRender

const REPAIR_LEASE_MS = 5 * 60 * 1000

/**
 * Finds the most recently uploaded PNG for one entity, including pre-recovery renders.
 * @param bucket Stage-specific asset bucket.
 * @param prefix Entity directory ending in a slash.
 * @returns Last successful immutable object key, or null for a new entity.
 * @remarks Listing is paginated; R2 lists by key, not upload time.
 */
export const findLastSuccessfulMapRender = async (
  bucket: R2Bucket,
  prefix: string,
): Promise<string | null> => {
  let latest: R2Object | null = null
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix, cursor })
    for (const object of page.objects) {
      if (
        object.key.endsWith('.png') &&
        object.size > 0 &&
        (!latest || object.uploaded > latest.uploaded)
      ) {
        latest = object
      }
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return latest?.key ?? null
}

/**
 * Enqueues an absent version once per repair lease, shared across request isolates.
 * @param bucket Stage-specific asset bucket.
 * @param queue Render queue for the same stage.
 * @param job Deterministic render job.
 * @returns Whether a new queue message was accepted.
 * @remarks Conditional R2 writes suppress concurrent readers. A five-minute lease
 * expires even if sending fails or a worker dies, allowing later reconciliation.
 */
export const enqueueMissingMapRender = async (
  bucket: R2Bucket,
  queue: { send: (job: MapRenderJob) => Promise<unknown> },
  job: MapRenderJob,
): Promise<boolean> => {
  if (await bucket.head(job.targetObjectKey)) return false

  // Keep coordination objects outside image directories and never store render tokens.
  const leaseKey = `mapRender-repairs/${job.kind}/${job.identifier}/${job.hash}`
  const previous = await bucket.head(leaseKey)
  if (previous && Date.now() - previous.uploaded.getTime() < REPAIR_LEASE_MS) {
    return false
  }
  const lease = await bucket.put(leaseKey, crypto.randomUUID(), {
    onlyIf: previous ? { etagMatches: previous.etag } : { etagDoesNotMatch: '*' },
    httpMetadata: { cacheControl: 'no-store' },
  })
  if (!lease) return false

  await queue.send(job)
  return true
}
