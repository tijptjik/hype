import { error, json, type RequestHandler } from '@sveltejs/kit'

// API
import { getDatabaseWithoutAuth, getSessionOrError } from '$lib/api'
// HELPERS
import { generateRenderJobsLocally } from '$lib/map/renders/local.server'
import { buildMapRenderJob } from '$lib/map/renders/jobs.server'
import { enqueueMapRenderJob } from '$lib/map/renders/queue.server'
import {
  buildProjectMapRenderHash,
  getProjectMapRenderData,
} from '$lib/map/renders/render.server'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. ROUTE HANDLER
//    - POST

/**
 * Rebuilds or enqueues regeneration for one project map preview.
 *
 * @param event Request event carrying the target project id.
 * @returns JSON summary of the refresh action.
 */
export const POST: RequestHandler = async ({ params, platform, locals, url }) => {
  const projectId = params.project

  if (!projectId) {
    throw error(404, 'Project preview not found')
  }

  await getSessionOrError(locals)

  const { db } = await getDatabaseWithoutAuth(platform)
  const renderData = await getProjectMapRenderData(db, projectId)

  if (!renderData) {
    throw error(404, 'Project preview not found')
  }

  const stage = platform?.env.ENVIRONMENT
  const publicOrigin = platform?.env.PUBLIC_ORIGIN ?? url.origin
  const renderToken = platform?.env.MAP_RENDER_TOKEN ?? null
  const hash = await buildProjectMapRenderHash(renderData)
  const job = buildMapRenderJob(publicOrigin, 'projects', projectId, hash, renderToken)
  const assetUrl = `/api/mapRenders/projects/${projectId}/asset`

  if (stage === 'preview' || stage === 'production') {
    if (!platform?.env.MAP_RENDER_QUEUE) {
      throw error(500, 'Preview queue binding is not available.')
    }

    await enqueueMapRenderJob(platform.env.MAP_RENDER_QUEUE, job)

    return json({
      ok: true,
      mode: 'enqueue',
      assetUrl,
      job,
    })
  }

  const entries = await generateRenderJobsLocally([job], {
    baseUrl: publicOrigin,
  })

  return json({
    ok: true,
    mode: 'local-generate',
    assetUrl,
    job,
    entries,
  })
}
