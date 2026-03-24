// HELPERS
import {
  buildMapRenderObjectKey,
  getMapRenderStage,
  resolveMapRenderAssetUrl,
} from '../renders/storage.shared'
import { getMapStyleAssetRecord, type MapStyleKey } from './registry'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. RENDER PATH HELPERS
//    - getMapStyleRenderPublicPath
//    - getMapStyleRenderObjectKey
//    - resolveMapStyleRenderUrl
//    - resolveMapStyleRenderPathForKey
//
// 2. HEADLESS RENDER CONFIG
//    - getMapStyleRenderOrigin

export const MAP_STYLE_RENDER_BASE_URL = 'http://localhost:5173'
export const MAP_STYLE_RENDER_READY_SELECTOR =
  '#map-style-render-ready[data-ready="true"]'

export const MAP_STYLE_RENDER_VIEW = {
  lng: 114.16834,
  lat: 22.32412,
  zoom: 17.83,
  bearing: 15.2,
  pitch: 0.5,
} as const

export const MAP_STYLE_RENDER_CAPTURE_SIZE = {
  width: 256,
  height: 256,
} as const

export const MAP_STYLE_RENDER_OUTPUT_SIZE = {
  width: 256,
  height: 256,
} as const

/**
 * Returns the public path for a built-in map-style render.
 *
 * @param code Map style code.
 * @param hash Content hash that versions the preview asset.
 * @returns Local public asset path.
 */
export const getMapStyleRenderPublicPath = (code: string, hash: string): string =>
  `/${getMapStyleRenderObjectKey(code, hash)}`

/**
 * Returns the local API asset path for a built-in map-style render.
 *
 * @param code Map style code.
 * @returns Local asset route path.
 */
export const getMapStyleRenderLocalPath = (code: string): string =>
  `/api/mapRenders/styles/${code}/asset`

/**
 * Builds the immutable object key for a map-style render.
 *
 * @param code Map style code.
 * @param hash Preview content hash.
 * @returns Canonical preview object key.
 */
export const getMapStyleRenderObjectKey = (code: string, hash: string): string =>
  buildMapRenderObjectKey({
    kind: 'styles',
    identifier: code,
    hash,
  })

/**
 * Resolves the public URL for a map-style render in the given environment.
 *
 * @param environment Runtime environment value.
 * @param code Map style code.
 * @param hash Preview content hash.
 * @returns Public CDN URL in preview/production, or local static path in development.
 */
export const resolveMapStyleRenderUrl = (
  environment: string | null | undefined,
  code: string,
  hash: string,
): string => {
  const stage = getMapRenderStage(environment)

  if (stage === 'local') {
    return getMapStyleRenderLocalPath(code)
  }

  return resolveMapRenderAssetUrl(
    stage,
    {
      kind: 'styles',
      identifier: code,
      hash,
    },
    getMapStyleRenderPublicPath(code, hash),
  )
}

/**
 * Resolves the environment-specific render path for one registered built-in map style.
 *
 * @param environment - Runtime environment value.
 * @param key - Registered built-in map-style key.
 * @returns Preview URL/path for the requested style in the current environment.
 */
export const resolveMapStyleRenderPathForKey = async (
  environment: string | null | undefined,
  key: MapStyleKey,
): Promise<string> => {
  const asset = await getMapStyleAssetRecord(key)
  return resolveMapStyleRenderUrl(environment, key, asset.hash)
}

/**
 * Resolves the render origin for headless map-style generation.
 *
 * @param publicOrigin Public app origin supplied by runtime config.
 * @returns Origin used to build headless preview URLs.
 */
export const getMapStyleRenderOrigin = (publicOrigin?: string | null): string =>
  publicOrigin ?? MAP_STYLE_RENDER_BASE_URL
