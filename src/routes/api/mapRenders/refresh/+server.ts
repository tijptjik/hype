import { json, type RequestHandler } from '@sveltejs/kit'

// API
import { getDatabaseWithoutAuth } from '#lib/api/index.js'
// HELPERS
import { listMapStyleDefinitions } from '#lib/map/styles/index.js'
import { buildMapStyleMapRenderJob } from '#lib/map/styles/render.jobs.server.js'
import { getMapStyleAssetRecord } from '#lib/map/styles/registry.js'
import { requireMapRefreshAccess } from '#lib/map/renders/auth.server.js'
import { enqueueMapRenderJob } from '#lib/map/renders/queue.server.js'
import {
  planLayerMapRenderRefreshJobs,
  planProjectMapRenderRefreshJobs,
} from '#lib/map/renders/render.server.js'
import type { MapRenderJob } from '#lib/map/renders/render.types.js'
import {
  getMapRenderQueue,
  getMapRenderRemoteConfig,
} from '#lib/api/services/render.js'

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

const loadLocalMapRenderRuntime = async () =>
  await import('#lib/map/renders/local.server.js')

const parseKinds = (url: URL): Array<'styles' | 'layers' | 'projects'> => {
  const rawKinds = url.searchParams.get('kinds') ?? 'layers,projects'

  return rawKinds
    .split(',')
    .map(kind => kind.trim())
    .filter(
      (kind): kind is 'styles' | 'layers' | 'projects' =>
        kind === 'styles' || kind === 'layers' || kind === 'projects',
    )
}

const planStyleMapRenderRefreshJobs = async (
  publicOrigin: string | null | undefined,
): Promise<MapRenderJob[]> => {
  const styleDefinitions = listMapStyleDefinitions()

  return await Promise.all(
    styleDefinitions.map(async definition => {
      const asset = await getMapStyleAssetRecord(definition.key)
      return buildMapStyleMapRenderJob(publicOrigin, definition.key, asset.hash)
    }),
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
  jobs: Array<'styles' | 'layers' | 'projects'>,
  db: Awaited<ReturnType<typeof getDatabaseWithoutAuth>>['db'],
  publicOrigin: string | null | undefined,
  renderToken: string | null | undefined,
  sinceHours: number,
  force: boolean,
): Promise<MapRenderJob[]> => {
  const plannedJobs: MapRenderJob[] = []

  if (jobs.includes('styles')) {
    plannedJobs.push(...(await planStyleMapRenderRefreshJobs(publicOrigin)))
  }

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
export const POST: RequestHandler = async ({ request, url, locals }) => {
  const { platform } = locals
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
    const { generateRenderJobsLocally } = await loadLocalMapRenderRuntime()
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
