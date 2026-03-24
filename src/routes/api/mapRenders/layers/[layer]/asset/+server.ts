import { error, redirect, type RequestHandler } from '@sveltejs/kit'

// API
import { getDatabaseWithoutAuth } from '$lib/api'
// HELPERS
import {
  buildMapRenderObjectKey,
  resolveMapRenderAssetUrl,
} from '$lib/map/renders/storage.shared'
import {
  buildLayerMapRenderHash,
  getLayerMapRenderData,
} from '$lib/map/renders/render.server'

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
export const GET: RequestHandler = async ({ params, platform }) => {
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
  const stage = platform?.env.ENVIRONMENT

  if (stage === 'preview' || stage === 'production') {
    throw redirect(
      307,
      resolveMapRenderAssetUrl(
        stage,
        {
          kind: 'layers',
          identifier: layerId,
          hash,
        },
        `/${objectKey}`,
      ),
    )
  }

  const object = await platform?.env.ASSET_PUBLIC_DEV.get(objectKey)

  if (!object) {
    throw error(404, 'Layer preview not found')
  }

  return new Response(object.body, {
    headers: {
      'cache-control': 'no-store',
      'content-type': object.httpMetadata?.contentType ?? 'image/png',
    },
  })
}
