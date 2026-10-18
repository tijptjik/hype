import { error, type RequestHandler } from '@sveltejs/kit'

// API
import { getDatabaseWithoutAuth } from '#lib/api/index.js'
// HELPERS
import { buildMapRenderObjectKey } from '#lib/map/renders/storage.shared.js'
import {
  buildLayerMapRenderHash,
  getLayerMapRenderData,
} from '#lib/map/renders/render.server.js'
import { serveMapRenderAsset } from '#lib/api/services/render.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. ROUTE HANDLER
//    - GET

/**
 * Serves the current layer render image from the dev asset bucket or redirects to the
 * current immutable remote asset URL.
 *
 * @param event Request event carrying the layer id.
 * @returns PNG response in local development, or a redirect to the immutable asset URL.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const { platform } = locals
  const layerId = params.layer

  if (!layerId) {
    throw error(404, 'Layer preview not found')
  }

  const { db } = await getDatabaseWithoutAuth(platform)
  const renderData = await getLayerMapRenderData(db, layerId)

  if (!renderData) {
    throw error(404, 'Layer preview not found')
  }

  const hash = await buildLayerMapRenderHash(renderData)
  const objectKey = buildMapRenderObjectKey({
    kind: 'layers',
    identifier: layerId,
    hash,
  })
  return await serveMapRenderAsset({
    platform,
    stage: platform?.env.ENVIRONMENT,
    kind: 'layers',
    identifier: layerId,
    hash,
    objectKey,
    notFoundMessage: 'Layer preview not found',
  })
}
