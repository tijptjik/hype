import { json, type RequestHandler } from '@sveltejs/kit'

// API
import { getDatabaseWithoutAuth } from '$lib/api'
// HELPERS
import { requirePreviewRefreshAccess } from '$lib/map/previews/auth.server'
import { generatePreviewJobsLocally } from '$lib/map/previews/local.server'
import { enqueuePreviewRenderJob } from '$lib/map/previews/queue.server'
import {
  planLayerPreviewRefreshJobs,
  planProjectPreviewRefreshJobs,
} from '$lib/map/previews/render.server'
import type { PreviewRenderJob } from '$lib/types'

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

const planPreviewJobs = async (
  jobs: Array<'layers' | 'projects'>,
  db: Awaited<ReturnType<typeof getDatabaseWithoutAuth>>['db'],
  publicOrigin: string | null | undefined,
  renderToken: string | null | undefined,
  sinceHours: number,
  force: boolean,
): Promise<PreviewRenderJob[]> => {
  const plannedJobs: PreviewRenderJob[] = []

  if (jobs.includes('layers')) {
    plannedJobs.push(
      ...(await planLayerPreviewRefreshJobs(
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
      ...(await planProjectPreviewRefreshJobs(
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
 * Plans and executes preview refresh work for layers and projects.
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
    requirePreviewRefreshAccess(request, platform)
  }

  const { db } = await getDatabaseWithoutAuth(platform)
  const publicOrigin = platform?.env.PUBLIC_ORIGIN ?? url.origin
  const renderToken = platform?.env.MAP_PREVIEW_RENDER_TOKEN ?? null
  const jobs = await planPreviewJobs(
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
    const entries = await generatePreviewJobsLocally(jobs, {
      baseUrl: publicOrigin,
      onProgress: ({ job, index, total, stage, entry }) => {
        if (stage === 'started') {
          console.log(
            `[map:previews] [${index}/${total}] Rendering ${job.kind}/${job.identifier}...`,
          )
          return
        }

        console.log(
          `[map:previews] [${index}/${total}] Completed ${job.kind}/${job.identifier} -> ${entry?.publicUrl ?? job.targetObjectKey}`,
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

  if (!platform?.env.PREVIEW_RENDER_QUEUE) {
    return json(
      {
        ok: false,
        mode,
        error: 'Preview queue binding is not available.',
      },
      { status: 500 },
    )
  }

  for (const job of jobs) {
    await enqueuePreviewRenderJob(platform.env.PREVIEW_RENDER_QUEUE, job)
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
