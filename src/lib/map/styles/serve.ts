import { error } from '@sveltejs/kit'

import {
  getDefaultMapStyleKey,
  getMapStyleAssetRecord,
  isMapStyleKey,
  type MapStyleKey,
} from './registry'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. REQUEST HELPERS
//    - resolveMapStyleKey
//    - serveMapStyleByKey

const redirectToAsset = (publicPath: string, request: Request): Response =>
  Response.redirect(new URL(publicPath, request.url).toString(), 307)

/**
 * Normalizes an arbitrary incoming style key to a supported registered key.
 *
 * @param value - Caller-supplied style key.
 * @returns Supported map-style key, or the default key.
 */
export const resolveMapStyleKey = (value: string | null | undefined): MapStyleKey =>
  value && isMapStyleKey(value) ? value : getDefaultMapStyleKey()

/**
 * Serves one built-in map style either inline or as a redirect to its immutable asset path.
 *
 * @param key - Requested style key.
 * @param request - Incoming request used for redirect and cache validation.
 * @returns Redirect or inline JSON response for the requested map style.
 */
export const serveMapStyleByKey = async (
  key: string,
  request: Request,
): Promise<Response> => {
  if (!isMapStyleKey(key)) {
    throw error(404, `Unknown map style: ${key}`)
  }

  const asset = await getMapStyleAssetRecord(key)
  const url = new URL(request.url)

  // Default to the hashed static asset so browser/CDN caches key off the immutable filename.
  if (url.searchParams.get('inline') !== '1') {
    return redirectToAsset(asset.publicPath, request)
  }

  const etag = `"${asset.hash}"`
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
      },
    })
  }

  return new Response(asset.json, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
      ETag: etag,
    },
  })
}
