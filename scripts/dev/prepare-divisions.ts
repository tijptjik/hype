// SERVICES
import { refreshDivisions } from '../../workers/division-refresh/src/refresh'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'

type DivisionState = {
  phase: string
  appliedRelease: string | null
  checkedMonth: string | null
}
type PendingJobs = { count: number; ready: number }
type FailedJob = { featureId: string; generation: number; attempts: number }

/**
 * Drains mirrored division jobs through the same fenced writer as the refresh worker.
 * @param db Validated local mirror binding.
 * @param env Server-side Atlas connection settings, never printed.
 * @returns Nothing once the current month's release and all feature jobs are complete.
 * @remarks Keeps existing memberships and checkpoints; never forces a rebuild or
 * clears a competing lease. Missing credentials, retries and bounded work fail closed.
 */
export async function prepareLocalDivisions(
  db: D1Database,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const month = new Date().toISOString().slice(0, 7)
  for (let step = 0; step <= 10_000; step++) {
    const state = await db
      .prepare(
        'SELECT phase,appliedRelease,checkedMonth FROM divisionRefresh WHERE id=1',
      )
      .first<DivisionState>()
    const pending = await db
      .prepare(
        'SELECT count(*) AS count,coalesce(sum(retryAt<=?),0) AS ready FROM featureDivisionJob',
      )
      .bind(Date.now())
      .first<PendingJobs>()
    if (!state || !pending) throw new Error('Local division refresh state is missing')
    if (
      state.phase === 'idle' &&
      state.appliedRelease &&
      state.checkedMonth === month &&
      pending.count === 0
    ) {
      console.info(`Local divisions ready: ${state.appliedRelease}`)
      return
    }
    if (step === 10_000)
      throw new Error(
        'Division backfill reached its step budget; rerun db:mirror:post:local',
      )
    if (pending.count > 0 && pending.ready === 0)
      throw new Error(
        'Division jobs are waiting for retryAt; rerun db:mirror:post:local after retry',
      )
    if (!env.SAANSEOI_API_KEY)
      throw new Error(
        'Division backfill requires server-side SAANSEOI_API_KEY in .dev.vars or the environment',
      )
    const previousFailures = await db
      .prepare(
        'SELECT featureId,generation,attempts FROM featureDivisionJob WHERE attempts>0',
      )
      .all<FailedJob>()
    const attemptsBefore = new Map(
      previousFailures.results.map(job => [
        `${job.featureId}:${job.generation}`,
        job.attempts,
      ]),
    )

    // Preserve the worker's release discovery, lease fencing and atomic membership replacement.
    const phase = await refreshDivisions(db, {
      baseUrl: env.SAANSEOI_BASE_URL ?? 'http://api.atlas.localhost',
      token: env.SAANSEOI_API_KEY,
    })
    if (phase === 'busy')
      throw new Error('Another division refresh owns the local database lease')
    const failed = await db
      .prepare(
        'SELECT featureId,generation,attempts FROM featureDivisionJob WHERE attempts>0',
      )
      .all<FailedJob>()
    if (
      failed.results.some(
        job =>
          job.attempts >
          (attemptsBefore.get(`${job.featureId}:${job.generation}`) ?? 0),
      )
    )
      throw new Error(
        'Division geocoding failed; inspect featureDivisionJob.lastError and retryAt before rerunning',
      )
    if (step % 10 === 0)
      console.info(`Local division backfill: step=${step + 1} pending=${pending.count}`)
  }
}
