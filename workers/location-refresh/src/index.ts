/// <reference path="../worker-configuration.d.ts" />
// SERVICES
import { runLocationRefreshSchedule } from './scheduled'
// TYPES
import type { ScheduledController, ExportedHandler } from '@cloudflare/workers-types'

/**
 * Fetch a Places response without forwarding credentials across redirects.
 * @param input Source request prepared by the Places client.
 * @param init Source headers, abort signal and request options.
 * @returns The upstream response for the client's normal status checks.
 * @remarks Workers supports manual redirects and requires a standalone global fetch call.
 */
async function fetchPlaceSource(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, { ...init, redirect: 'manual' })
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel()
    throw new Error('LOCATION_SOURCE_REDIRECT')
  }
  return response
}

export default {
  /**
   * Drain bounded Locations and routing work using environment-specific bindings.
   * @param controller Scheduled event.
   * @param env Generated D1, source and routing bindings.
   * @returns Completion of one durable step; discovery itself remains monthly.
   */
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    await runLocationRefreshSchedule(controller.cron, env, {
      baseUrl: env.SAANSEOI_BASE_URL,
      apiKey: env.SAANSEOI_API_KEY,
      fetch: fetchPlaceSource,
    })
  },
} satisfies ExportedHandler<Env>
