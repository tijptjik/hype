import { error, json, type RequestHandler } from '@sveltejs/kit'

// API
import { getDatabaseWithoutAuth, getSessionOrError } from '$lib/api'
// HELPERS
import { generatePreviewJobsLocally } from '$lib/map/previews/local.server'
import { buildPreviewRenderJob } from '$lib/map/previews/jobs.server'
import { enqueuePreviewRenderJob } from '$lib/map/previews/queue.server'
import {
  buildProjectPreviewHash,
  getProjectPreviewRenderData,
} from '$lib/map/previews/render.server'

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
  const renderData = await getProjectPreviewRenderData(db, projectId)

  if (!renderData) {
    throw error(404, 'Project preview not found')
  }

  const stage = platform?.env.ENVIRONMENT
  const publicOrigin = platform?.env.PUBLIC_ORIGIN ?? url.origin
  const renderToken = platform?.env.MAP_PREVIEW_RENDER_TOKEN ?? null
  const hash = await buildProjectPreviewHash(renderData)
  const job = buildPreviewRenderJob(
    publicOrigin,
    'projects',
    projectId,
    hash,
    renderToken,
  )
  const assetUrl = `/api/mapPreviews/projects/${projectId}/asset`

  if (stage === 'preview' || stage === 'production') {
    if (!platform?.env.PREVIEW_RENDER_QUEUE) {
      throw error(500, 'Preview queue binding is not available.')
    }

    await enqueuePreviewRenderJob(platform.env.PREVIEW_RENDER_QUEUE, job)

    return json({
      ok: true,
      mode: 'enqueue',
      assetUrl,
      job,
    })
  }

  const entries = await generatePreviewJobsLocally([job], {
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
