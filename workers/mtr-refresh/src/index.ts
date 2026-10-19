/// <reference path="../worker-configuration.d.ts" />
// ROUTING
import { refreshFeatureMtr } from '../../../src/lib/routing/mtr-refresh'

export default {
  /**
   * Retries a bounded batch of durable feature-access calculations.
   * @param controller - Scheduled event.
   * @param env - Generated D1 and routing bindings.
   * @returns Completion of up to five jobs, without overlapping leases.
   */
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    for (let i = 0; i < 5; i++) {
      const status = await refreshFeatureMtr(env, undefined, 90000)
      if (status === 'idle' || status === 'retry') break
    }
  },
} satisfies ExportedHandler<Env>
