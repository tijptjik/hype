import { readFile } from 'node:fs/promises'

import { error, redirect, type RequestHandler } from '@sveltejs/kit'

// API
import { getDatabaseWithoutAuth } from '$lib/api'
// HELPERS
import { getLocalRenderFilePath } from '$lib/map/renders/local.server'
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
 * Serves the current layer render image from local storage or redirects to the
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

  try {
    const body = await readFile(
      getLocalRenderFilePath({
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
