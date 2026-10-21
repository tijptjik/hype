// SERVICES
import { refreshLocations } from '../../../src/lib/locations/refresh'
import { refreshFeatureMtr } from '../../../src/lib/routing/mtr-refresh'
// TYPES
import type { MtrEnvironment } from '../../../src/lib/routing/mtr-refresh'
import type { PlaceSourceClient } from '../../../src/lib/locations/sourceClient'

/**
 * Run one primary-session refresh step and drain one durable routing job.
 * @param cron Configured schedule identifier.
 * @param env Database and routing capabilities.
 * @param source Trusted SaanSeoi connection.
 * @returns Completion; source failures retain checkpoints and routing failures retain jobs.
 * @remarks Never log upstream errors, source records, coordinates or credentials.
 */
export async function runLocationRefreshSchedule(
  cron: string,
  env: MtrEnvironment,
  source: PlaceSourceClient,
): Promise<void> {
  if (cron !== '*/5 * * * *') throw new Error('UNKNOWN_LOCATION_REFRESH_CRON')
  try {
    const phase = await refreshLocations(env.DB.withSession('first-primary'), source)
    console.log(JSON.stringify({ task: 'place-refresh', phase }))
  } catch {
    // The durable state retains a stable retry code; do not leak source errors to logs.
    throw new Error('LOCATION_REFRESH_STEP_FAILED')
  } finally {
    try {
      const phase = await refreshFeatureMtr(env, undefined, 90_000)
      console.log(JSON.stringify({ task: 'place-refresh-routing', phase }))
    } catch {
      console.warn('Location routing deferred to durable MTR retry')
    }
  }
}
