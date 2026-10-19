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
  await prepareDivisions(
    db,
    {
      baseUrl: env.SAANSEOI_BASE_URL ?? 'http://api.atlas.localhost',
      token: env.SAANSEOI_API_KEY,
    },
    'Local',
  )
}

/**
 * Drains durable division work using the scheduled worker's fenced writer.
 * @param db Explicit local or remote database binding, using primary reads remotely.
 * @param api Server-side Atlas connection settings, never printed.
 * @param label Environment name for progress messages.
 * @returns Nothing after the current release and all jobs are complete.
 * @remarks Stops on contention, failed jobs or deferred retries; rerunning resumes checkpoints.
 */
export async function prepareDivisions(
  db: Pick<D1Database, 'prepare' | 'batch'>,
  api: { baseUrl: string; token?: string },
  label: string,
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
    if (!state || !pending) throw new Error('Division refresh state is missing')
    if (
      state.phase === 'idle' &&
      state.appliedRelease &&
      state.checkedMonth === month &&
      pending.count === 0
    ) {
      console.info(`${label} divisions ready: ${state.appliedRelease}`)
      return
    }
    if (step === 10_000)
      throw new Error(
        'Division backfill reached its step budget; rerun the preparation command',
      )
    if (pending.count > 0 && pending.ready === 0)
      throw new Error(
        'Division jobs are waiting for retryAt; rerun the preparation command after retry',
      )
    if (!api.token)
      throw new Error(
        'Division backfill requires server-side SAANSEOI_API_KEY in .dev.vars or the environment',
      )
    const previousFailures = await db
      .prepare(
        'SELECT featureId,generation,attempts FROM featureDivisionJob WHERE attempts>0',
      )
      .all<FailedJob>()
    const attemptsBefore = new Map(
      previousFailures.results.map((job) => [
        `${job.featureId}:${job.generation}`,
        job.attempts,
      ]),
    )

    // Preserve the worker's release discovery, lease fencing and atomic membership replacement.
    const phase = await refreshDivisions(db, api)
    if (phase === 'busy')
      throw new Error('Another division refresh owns the database lease')
    const failed = await db
      .prepare(
        'SELECT featureId,generation,attempts FROM featureDivisionJob WHERE attempts>0',
      )
      .all<FailedJob>()
    if (
      failed.results.some(
        (job) =>
          job.attempts >
          (attemptsBefore.get(`${job.featureId}:${job.generation}`) ?? 0),
      )
    )
      throw new Error(
        'Division geocoding failed; inspect featureDivisionJob.lastError and retryAt before rerunning',
      )
    if (step % 10 === 0)
      console.info(
        `${label} division backfill: step=${step + 1} pending=${pending.count}`,
      )
  }
}
