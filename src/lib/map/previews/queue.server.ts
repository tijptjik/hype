// TYPES
import type { PreviewRenderJob } from '$lib/types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. QUEUE HELPERS
//    - enqueuePreviewRenderJob

/**
 * Enqueues a preview render job for asynchronous processing.
 *
 * @param queue Cloudflare Queue binding from `platform.env`.
 * @param job Preview render payload.
 * @returns Promise that resolves when the message has been accepted by the queue.
 */
export const enqueuePreviewRenderJob = async (
  queue: { send: (job: PreviewRenderJob) => Promise<void> },
  job: PreviewRenderJob,
): Promise<void> => {
  await queue.send(job)
}
