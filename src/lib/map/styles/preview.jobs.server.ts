// TYPES
import type { PreviewRenderJob } from '../../types'
// HELPERS
import {
  getMapStylePreviewObjectKey,
  getMapStylePreviewRenderOrigin,
  MAP_STYLE_PREVIEW_VIEW,
} from './preview.shared'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. JOB PAYLOAD HELPERS
//    - buildMapStylePreviewRenderUrl
//    - buildMapStylePreviewRenderJob

/**
 * Builds the canonical headless render URL for a map-style preview.
 *
 * @param publicOrigin Public app origin supplied by runtime config.
 * @param styleCode Map style code.
 * @returns Fully qualified headless preview URL.
 */
export const buildMapStylePreviewRenderUrl = (
  publicOrigin: string | null | undefined,
  styleCode: string,
): string => {
  const url = new URL(
    `/headless/map-style-preview/${styleCode}`,
    getMapStylePreviewRenderOrigin(publicOrigin),
  )

  url.searchParams.set('lng', String(MAP_STYLE_PREVIEW_VIEW.lng))
  url.searchParams.set('lat', String(MAP_STYLE_PREVIEW_VIEW.lat))
  url.searchParams.set('zoom', String(MAP_STYLE_PREVIEW_VIEW.zoom))
  url.searchParams.set('bearing', String(MAP_STYLE_PREVIEW_VIEW.bearing))
  url.searchParams.set('pitch', String(MAP_STYLE_PREVIEW_VIEW.pitch))

  return url.toString()
}

/**
 * Creates a queue message for a map-style preview render.
 *
 * @param publicOrigin Public app origin supplied by runtime config.
 * @param styleCode Map style code.
 * @param hash Preview content hash.
 * @returns Queue payload for the preview renderer worker.
 */
export const buildMapStylePreviewRenderJob = (
  publicOrigin: string | null | undefined,
  styleCode: string,
  hash: string,
): PreviewRenderJob => ({
  kind: 'styles',
  identifier: styleCode,
  hash,
  sourceUrl: buildMapStylePreviewRenderUrl(publicOrigin, styleCode),
  targetObjectKey: getMapStylePreviewObjectKey(styleCode, hash),
})
