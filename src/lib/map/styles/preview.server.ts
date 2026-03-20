import path from 'node:path'

import {
  getMapStylePreviewObjectKey,
  getMapStylePreviewPublicPath,
} from './preview.shared'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. LOCAL PREVIEW FILE HELPERS
//    - getMapStylePreviewFilePath

export const MAP_STYLE_PREVIEW_DIR = path.resolve('static/mapPreviews/styles')

export { getMapStylePreviewPublicPath }

/**
 * Resolves the on-disk output path for a local map-style preview.
 *
 * @param code Map style code.
 * @param hash Content hash that versions the preview asset.
 * @returns Absolute output path under `static/mapPreviews/styles/`.
 */
export const getMapStylePreviewFilePath = (code: string, hash: string): string =>
  path.resolve('static', getMapStylePreviewObjectKey(code, hash))
