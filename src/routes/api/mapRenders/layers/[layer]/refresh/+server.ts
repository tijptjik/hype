import { error, type RequestHandler } from '@sveltejs/kit'

// API
import { getDatabaseWithoutAuth, getSessionOrError } from '$lib/api'
// HELPERS
import {
  buildLayerMapRenderHash,
  getLayerMapRenderData,
} from '$lib/map/renders/render.server'
import { runSingleMapRenderRefresh } from '$lib/api/services/render'

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
  const renderData = await getLayerMapRenderData(db, layerId)

  if (!renderData) {
    throw error(404, 'Layer preview not found')
  }

  const publicOrigin = platform?.env.PUBLIC_ORIGIN ?? url.origin
  const renderToken = platform?.env.MAP_RENDER_TOKEN ?? null
  const hash = await buildLayerMapRenderHash(renderData)
  return await runSingleMapRenderRefresh({
    platform,
    publicOrigin,
    stage: platform?.env.ENVIRONMENT,
    kind: 'layers',
    identifier: layerId,
    hash,
    renderToken,
  })
}
