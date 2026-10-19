// TYPES
import type { AbortSignal as WorkerAbortSignal } from '@cloudflare/workers-types'
// ROUTING
import { refreshFeatureMtr } from '#lib/routing/mtr-refresh.js'

/**
 * Starts durable MTR enrichment after an authorized feature mutation.
 * @param platform - Request-local platform with routing and database bindings.
 * @param featureId - Newly created or moved feature.
 * @returns Nothing; the request context owns the background promise.
 * @remarks SQL triggers create the job even when routing is temporarily unavailable.
 */
export function scheduleFeatureMtr(
  platform: App.Platform | undefined,
  featureId: string,
): void {
  if (!platform?.env.ROUTING_SERVICE || !platform.env.ROUTING_TOKEN) return
  const binding = platform.env.ROUTING_SERVICE
  platform.context.waitUntil(
    refreshFeatureMtr(
      {
        DB: platform.env.DB,
        ROUTING_TOKEN: platform.env.ROUTING_TOKEN,
        ROUTING_SERVICE: {
          fetch: (url, init) =>
            binding.fetch(url, {
              ...init,
              // DOM and Worker declarations describe the same runtime AbortSignal.
              signal: init?.signal as WorkerAbortSignal | undefined,
            }),
        },
      },
      featureId,
    ).catch(() => {
      console.warn('MTR refresh deferred to durable retry')
    }),
  )
}
