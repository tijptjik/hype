// SERVICES
import { refreshPlaces } from '../../../src/lib/places/refresh'
import { refreshFeatureMtr } from '../../../src/lib/routing/mtr-refresh'
import { refreshPlaceSourceEvidence } from '../../../src/lib/places/sourceRefresh'
// TYPES
import type { MtrEnvironment } from '../../../src/lib/routing/mtr-refresh'
import type { PlaceSourceClient } from '../../../src/lib/places/sourceClient'

/**
 * Run one primary-session refresh step and drain one durable routing job.
 * @param cron Configured schedule identifier.
 * @param env Database and routing capabilities.
 * @param source Trusted SaanSeoi connection.
 * @returns Completion; source failures retain checkpoints and routing failures retain jobs.
 * @remarks Never log upstream errors, source records, coordinates or credentials.
 */
export async function runPlaceRefreshSchedule(
  cron: string,
  env: MtrEnvironment,
  source: PlaceSourceClient,
): Promise<void> {
  if (cron !== '*/5 * * * *') throw new Error('UNKNOWN_PLACE_REFRESH_CRON')
  try {
    const phase = await refreshPlaces(env.DB.withSession('first-primary'), source)
    console.log(JSON.stringify({ task: 'place-refresh', phase }))
  } catch {
    // The durable state retains a stable retry code; do not leak source errors to logs.
    throw new Error('PLACE_REFRESH_STEP_FAILED')
  } finally {
    try {
      const phase = await refreshPlaceSourceEvidence(
        env.DB.withSession('first-primary'),
        source,
      )
      console.log(JSON.stringify({ task: 'place-source-evidence', phase }))
    } catch {
      console.warn('Place source evidence deferred to durable retry')
    }
    try {
      const phase = await refreshFeatureMtr(env, undefined, 90_000)
      console.log(JSON.stringify({ task: 'place-refresh-routing', phase }))
    } catch {
      console.warn('Place routing deferred to durable MTR retry')
    }
  }
}
