// HELPERS
import {
  buildPreviewObjectKey,
  getPreviewStage,
  resolvePreviewAssetUrl,
} from '../previews/storage.shared'
import { getMapStyleAssetRecord, type MapStyleKey } from './registry'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. PREVIEW PATH HELPERS
//    - getMapStylePreviewPublicPath
//    - getMapStylePreviewObjectKey
//    - resolveMapStylePreviewUrl
//    - resolveMapStylePreviewPathForKey
//
// 2. HEADLESS PREVIEW CONFIG
//    - getMapStylePreviewRenderOrigin

export const MAP_STYLE_PREVIEW_BASE_URL = 'http://localhost:5173'
export const MAP_STYLE_PREVIEW_READY_SELECTOR =
  '#map-style-preview-ready[data-ready="true"]'

export const MAP_STYLE_PREVIEW_VIEW = {
  lng: 114.16834,
  lat: 22.32412,
  zoom: 17.83,
  bearing: 15.2,
  pitch: 0.5,
} as const

export const MAP_STYLE_PREVIEW_CAPTURE_SIZE = {
  width: 256,
  height: 256,
} as const

export const MAP_STYLE_PREVIEW_OUTPUT_SIZE = {
  width: 256,
  height: 256,
} as const

/**
 * Returns the public path for a built-in map-style preview.
 *
 * @param code Map style code.
 * @param hash Content hash that versions the preview asset.
 * @returns Local public asset path.
 */
export const getMapStylePreviewPublicPath = (code: string, hash: string): string =>
  `/${getMapStylePreviewObjectKey(code, hash)}`

/**
 * Builds the immutable object key for a map-style preview.
 *
 * @param code Map style code.
 * @param hash Preview content hash.
 * @returns Canonical preview object key.
 */
export const getMapStylePreviewObjectKey = (code: string, hash: string): string =>
  buildPreviewObjectKey({
    kind: 'styles',
    identifier: code,
    hash,
  })

/**
 * Resolves the public URL for a map-style preview in the given environment.
 *
 * @param environment Runtime environment value.
 * @param code Map style code.
 * @param hash Preview content hash.
 * @returns Public CDN URL in preview/production, or local static path in development.
 */
export const resolveMapStylePreviewUrl = (
  environment: string | null | undefined,
  code: string,
  hash: string,
): string =>
  resolvePreviewAssetUrl(
    getPreviewStage(environment),
    {
      kind: 'styles',
      identifier: code,
      hash,
    },
    getMapStylePreviewPublicPath(code, hash),
  )

/**
 * Resolves the environment-specific preview path for one registered built-in map style.
 *
 * @param environment - Runtime environment value.
 * @param key - Registered built-in map-style key.
 * @returns Preview URL/path for the requested style in the current environment.
 */
export const resolveMapStylePreviewPathForKey = async (
  environment: string | null | undefined,
  key: MapStyleKey,
): Promise<string> => {
  const asset = await getMapStyleAssetRecord(key)
  return resolveMapStylePreviewUrl(environment, key, asset.hash)
}

/**
 * Resolves the render origin for headless preview generation.
 *
 * @param publicOrigin Public app origin supplied by runtime config.
 * @returns Origin used to build headless preview URLs.
 */
export const getMapStylePreviewRenderOrigin = (publicOrigin?: string | null): string =>
  publicOrigin ?? MAP_STYLE_PREVIEW_BASE_URL
