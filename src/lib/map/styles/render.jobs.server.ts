// TYPES
import type { MapRenderJob } from '../../types'
// HELPERS
import {
  getMapStyleRenderObjectKey,
  getMapStyleRenderOrigin,
  MAP_STYLE_RENDER_VIEW,
} from './render.shared'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. JOB PAYLOAD HELPERS
//    - buildMapStyleRenderUrl
//    - buildMapStyleMapRenderJob

/**
 * Builds the canonical headless render URL for a map-style render.
 *
 * @param publicOrigin Public app origin supplied by runtime config.
 * @param styleCode Map style code.
 * @returns Fully qualified headless preview URL.
 */
export const buildMapStyleRenderUrl = (
  publicOrigin: string | null | undefined,
  styleCode: string,
): string => {
  const url = new URL(
    `/headless/map-style-render/${styleCode}`,
    getMapStyleRenderOrigin(publicOrigin),
  )

  url.searchParams.set('lng', String(MAP_STYLE_RENDER_VIEW.lng))
  url.searchParams.set('lat', String(MAP_STYLE_RENDER_VIEW.lat))
  url.searchParams.set('zoom', String(MAP_STYLE_RENDER_VIEW.zoom))
  url.searchParams.set('bearing', String(MAP_STYLE_RENDER_VIEW.bearing))
  url.searchParams.set('pitch', String(MAP_STYLE_RENDER_VIEW.pitch))

  return url.toString()
}

/**
 * Creates a queue message for a map-style map render.
 *
 * @param publicOrigin Public app origin supplied by runtime config.
 * @param styleCode Map style code.
 * @param hash Preview content hash.
 * @returns Queue payload for the map renderer worker.
 */
export const buildMapStyleMapRenderJob = (
  publicOrigin: string | null | undefined,
  styleCode: string,
  hash: string,
): MapRenderJob => ({
  kind: 'styles',
  identifier: styleCode,
  hash,
  sourceUrl: buildMapStyleRenderUrl(publicOrigin, styleCode),
  targetObjectKey: getMapStyleRenderObjectKey(styleCode, hash),
})
