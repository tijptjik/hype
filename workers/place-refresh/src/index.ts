/// <reference path="../worker-configuration.d.ts" />
// SERVICES
import { runPlaceRefreshSchedule } from './scheduled'
// TYPES
import type { ScheduledController, ExportedHandler } from '@cloudflare/workers-types'

export default {
  /**
   * Drain bounded Places and routing work using environment-specific bindings.
   * @param controller Scheduled event.
   * @param env Generated D1, source and routing bindings.
   * @returns Completion of one durable step; discovery itself remains monthly.
   */
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    await runPlaceRefreshSchedule(controller.cron, env, {
      baseUrl: env.SAANSEOI_BASE_URL,
      apiKey: env.SAANSEOI_API_KEY,
      fetch,
    })
  },
} satisfies ExportedHandler<Env>
