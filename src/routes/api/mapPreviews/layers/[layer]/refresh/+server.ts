import { error, json, type RequestHandler } from '@sveltejs/kit'

// API
import { getDatabaseWithoutAuth, getSessionOrError } from '$lib/api'
// HELPERS
import { generatePreviewJobsLocally } from '$lib/map/previews/local.server'
import { buildPreviewRenderJob } from '$lib/map/previews/jobs.server'
import { enqueuePreviewRenderJob } from '$lib/map/previews/queue.server'
import {
  buildLayerPreviewHash,
  getLayerPreviewRenderData,
} from '$lib/map/previews/render.server'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. ROUTE HANDLER
//    - POST

/**
 * Rebuilds or enqueues regeneration for one layer map preview.
 *
 * @param event Request event carrying the target layer id.
 * @returns JSON summary of the refresh action.
 */
export const POST: RequestHandler = async ({ params, platform, locals, url }) => {
  const layerId = params.layer

  if (!layerId) {
    throw error(404, 'Layer preview not found')
  }

  await getSessionOrError(locals)

  const { db } = await getDatabaseWithoutAuth(platform)
  const renderData = await getLayerPreviewRenderData(db, layerId)

  if (!renderData) {
    throw error(404, 'Layer preview not found')
  }

  const stage = platform?.env.ENVIRONMENT
  const publicOrigin = platform?.env.PUBLIC_ORIGIN ?? url.origin
  const renderToken = platform?.env.MAP_PREVIEW_RENDER_TOKEN ?? null
  const hash = await buildLayerPreviewHash(renderData)
  const job = buildPreviewRenderJob(publicOrigin, 'layers', layerId, hash, renderToken)
  const assetUrl = `/api/mapPreviews/layers/${layerId}/asset`

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
