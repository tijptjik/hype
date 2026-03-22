import { readFile } from 'node:fs/promises'

import { error, redirect, type RequestHandler } from '@sveltejs/kit'

// API
import { getDatabaseWithoutAuth } from '$lib/api'
// HELPERS
import { getLocalPreviewFilePath } from '$lib/map/previews/local.server'
import { resolvePreviewAssetUrl } from '$lib/map/previews/storage.shared'
import {
  buildLayerPreviewHash,
  getLayerPreviewRenderData,
} from '$lib/map/previews/render.server'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. ROUTE HANDLER
//    - GET

/**
 * Serves the current layer preview image from local storage or redirects to the
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
  const renderData = await getLayerPreviewRenderData(db, layerId)

  if (!renderData) {
    throw error(404, 'Layer preview not found')
  }

  const hash = await buildLayerPreviewHash(renderData)
  const objectKey = `mapPreviews/layers/${layerId}/${hash}.png`
  const stage = platform?.env.ENVIRONMENT

  if (stage === 'preview' || stage === 'production') {
    throw redirect(
      307,
      resolvePreviewAssetUrl(
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

  try {
    const body = await readFile(
      getLocalPreviewFilePath({
        kind: 'layers',
        identifier: layerId,
        hash,
        sourceUrl: '',
        targetObjectKey: objectKey,
      }),
    )

    return new Response(body, {
      headers: {
        'cache-control': 'no-store',
        'content-type': 'image/png',
      },
    })
  } catch {
    throw error(404, 'Layer preview not found')
  }
}
