/// <reference types="@cloudflare/workers-types" />
/// <reference path="../worker-configuration.d.ts" />
// SERVICES
import { refreshDivisions } from './refresh'

export default {
  /**
   * Drains durable work and discovers a new release once per calendar month.
   * @param controller Cloudflare scheduled event.
   * @param env Environment-specific bindings.
   * @returns Completion of a bounded refresh step.
   */
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (controller.cron !== '*/5 * * * *')
      throw new Error('UNKNOWN_DIVISION_REFRESH_CRON')
    const phase = await refreshDivisions(env.DB.withSession('first-primary'), {
      baseUrl: env.SAANSEOI_BASE_URL,
      token: env.SAANSEOI_API_KEY,
    })
    console.log(JSON.stringify({ task: 'division-refresh', phase }))
  },
} satisfies ExportedHandler<Env>
