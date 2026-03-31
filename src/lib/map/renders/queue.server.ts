// TYPES
import type { MapRenderJob } from '$lib/types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. QUEUE HELPERS
//    - enqueueMapRenderJob

/**
 * Enqueues a map render job for asynchronous processing.
 *
 * @param queue Cloudflare Queue binding from `platform.env`.
 * @param job Preview render payload.
 * @returns Promise that resolves when the message has been accepted by the queue.
 */
export const enqueueMapRenderJob = async (
  queue: { send: (job: MapRenderJob) => Promise<void> },
  job: MapRenderJob,
): Promise<void> => {
  await queue.send(job)
}
