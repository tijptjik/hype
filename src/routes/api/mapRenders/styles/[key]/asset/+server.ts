import { error, redirect, type RequestHandler } from '@sveltejs/kit'

import { getMapStyleAssetRecord, isMapStyleKey } from '$lib/map/styles'
import {
  getMapStyleRenderObjectKey,
  resolveMapStyleRenderUrl,
} from '$lib/map/styles/render.shared'

const getDevAssetBucket = (platform?: App.Platform): R2Bucket => {
  const bucket = platform?.env.ASSET_PUBLIC_DEV

  if (!bucket) {
    throw error(500, 'Dev asset bucket is not available')
  }

  return bucket
}

export const GET: RequestHandler = async ({ params, platform }) => {
  const key = params.key

  if (!key || !isMapStyleKey(key)) {
    throw error(404, 'Unknown map style render')
  }

  const asset = await getMapStyleAssetRecord(key)
  const objectKey = getMapStyleRenderObjectKey(key, asset.hash)
  const stage = platform?.env.ENVIRONMENT

  if (stage === 'preview' || stage === 'production') {
    throw redirect(307, resolveMapStyleRenderUrl(stage, key, asset.hash))
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
