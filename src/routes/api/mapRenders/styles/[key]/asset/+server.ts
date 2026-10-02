import { error, redirect, type RequestHandler } from '@sveltejs/kit'

import { getMapStyleAssetRecord, isMapStyleKey } from '#lib/map/styles/index.js'
import {
  getMapStyleRenderObjectKey,
  resolveMapStyleRenderUrl,
} from '#lib/map/styles/render.shared.js'

/**
 * Resolves the local bucket used for generated map style assets.
 * @param platform - App-owned Worker binding bundle.
 * @returns The available asset bucket.
 */
const getDevAssetBucket = (platform?: App.Platform): R2Bucket => {
  const bucket = platform?.env.ASSET_PUBLIC_DEV

  if (!bucket) {
    throw error(500, 'Dev asset bucket is not available')
  }

  return bucket
}

/**
 * Serves a local style render or redirects to its immutable CDN asset.
 * @param event - Route parameters and the request-owned Worker bindings.
 * @returns The local PNG response, or an external redirect for deployed stages.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const { platform } = locals
  const key = params.key

  if (!key || !isMapStyleKey(key)) {
    throw error(404, 'Unknown map style render')
  }

  const asset = await getMapStyleAssetRecord(key)
  const objectKey = getMapStyleRenderObjectKey(key, asset.hash)
  const stage = platform?.env.ENVIRONMENT

  if (stage === 'preview' || stage === 'production') {
    // Immutable style renders live on the asset CDN rather than the application origin.
    throw redirect(307, resolveMapStyleRenderUrl(stage, key, asset.hash), {
      external: true,
    })
  }

  const object = await getDevAssetBucket(platform).get(objectKey)

  if (!object) {
    throw error(404, 'Map style render not found')
  }

  return new Response(object.body, {
    headers: {
      'cache-control': 'no-store',
      'content-type': object.httpMetadata?.contentType ?? 'image/png',
    },
  })
}
