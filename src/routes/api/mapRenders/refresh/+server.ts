import { json, type RequestHandler } from '@sveltejs/kit'

// API
import { getDatabaseWithoutAuth } from '$lib/api'
// HELPERS
import { requireMapRefreshAccess } from '$lib/map/renders/auth.server'
import { generateRenderJobsLocally } from '$lib/map/renders/local.server'
import { enqueueMapRenderJob } from '$lib/map/renders/queue.server'
import {
  planLayerMapRenderRefreshJobs,
  planProjectMapRenderRefreshJobs,
} from '$lib/map/renders/render.server'
import type { MapRenderJob } from '$lib/types'
import { getMapRenderQueue, getMapRenderRemoteConfig } from '$lib/api/services/render'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. QUERY HELPERS
//    - parseKinds
//    - parseMode
//
// 2. ROUTE HANDLER
//    - POST

type RefreshMode = 'plan' | 'enqueue' | 'local-generate'

const parseKinds = (url: URL): Array<'layers' | 'projects'> => {
  const rawKinds = url.searchParams.get('kinds') ?? 'layers,projects'

  return rawKinds
    .split(',')
    .map(kind => kind.trim())
    .filter(
      (kind): kind is 'layers' | 'projects' => kind === 'layers' || kind === 'projects',
    )
}

const parseMode = (url: URL, environment: string | undefined): RefreshMode => {
  const mode = url.searchParams.get('mode')

  if (mode === 'plan' || mode === 'enqueue' || mode === 'local-generate') {
    return mode
  }

  return environment === 'local' ? 'local-generate' : 'enqueue'
}

const planMapRenderJobs = async (
  jobs: Array<'layers' | 'projects'>,
  db: Awaited<ReturnType<typeof getDatabaseWithoutAuth>>['db'],
  publicOrigin: string | null | undefined,
  renderToken: string | null | undefined,
  sinceHours: number,
  force: boolean,
): Promise<MapRenderJob[]> => {
  const plannedJobs: MapRenderJob[] = []

  if (jobs.includes('layers')) {
    plannedJobs.push(
      ...(await planLayerMapRenderRefreshJobs(
        db,
        publicOrigin,
        renderToken,
        sinceHours,
        force,
      )),
    )
  }

  if (jobs.includes('projects')) {
    plannedJobs.push(
      ...(await planProjectMapRenderRefreshJobs(
        db,
        publicOrigin,
        renderToken,
        sinceHours,
        force,
      )),
    )
  }

  return plannedJobs
}

/**
 * Plans and executes map render refresh work for layers and projects.
 *
 * @param event Request event.
 * @returns JSON summary of the planned or executed preview work.
 */
export const POST: RequestHandler = async ({ platform, request, url }) => {
  const environment = platform?.env.ENVIRONMENT
  const kinds = parseKinds(url)
  const mode = parseMode(url, environment)
  const sinceHours = Number(url.searchParams.get('sinceHours') ?? '24')
  const force = url.searchParams.get('force') === 'true'

  if (environment !== 'local') {
    requireMapRefreshAccess(request, platform)
  }

  const { db } = await getDatabaseWithoutAuth(platform)
  const publicOrigin = platform?.env.PUBLIC_ORIGIN ?? url.origin
  const renderToken = platform?.env.MAP_RENDER_TOKEN ?? null
  const jobs = await planMapRenderJobs(
    kinds,
    db,
    publicOrigin,
    renderToken,
    sinceHours,
    force,
  )

  if (mode === 'plan') {
    return json({
      ok: true,
      mode,
      kinds,
      sinceHours,
      force,
      planned: jobs.length,
      jobs,
    })
  }

  if (mode === 'local-generate') {
    const startedAt = Date.now()
    const entries = await generateRenderJobsLocally(jobs, {
      baseUrl: publicOrigin,
      stage: 'local',
      remoteConfig: getMapRenderRemoteConfig(platform),
      onProgress: ({ job, index, total, stage, entry }) => {
        if (stage === 'started') {
          console.log(
            `[map:renders] [${index}/${total}] Rendering ${job.kind}/${job.identifier}...`,
          )
          return
        }

        console.log(
          `[map:renders] [${index}/${total}] Completed ${job.kind}/${job.identifier} -> ${entry?.publicUrl ?? job.targetObjectKey}`,
        )
      },
    })

    return json({
      ok: true,
      mode,
      kinds,
      sinceHours,
      force,
      planned: jobs.length,
      generated: Object.keys(entries).length,
      durationMs: Date.now() - startedAt,
      entries,
    })
  }

  for (const job of jobs) {
    await enqueueMapRenderJob(getMapRenderQueue(platform), job)
  }

  return json({
    ok: true,
    mode,
    kinds,
    sinceHours,
    force,
    planned: jobs.length,
    enqueued: jobs.length,
  })
}
