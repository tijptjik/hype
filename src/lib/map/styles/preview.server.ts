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
//    - getMapStylePreviewManifestPath

export const MAP_STYLE_PREVIEW_DIR = path.resolve('static', 'mapRender', 'styles')

export { getMapStylePreviewPublicPath }

/**
 * Resolves the on-disk output path for a local map-style preview.
 *
 * @param code Map style code.
 * @returns Absolute output path under the local static asset directory.
 */
export const getMapStylePreviewFilePath = (code: string): string =>
  path.join(MAP_STYLE_PREVIEW_DIR, `${code}.png`)

/**
 * Resolves the manifest path used to track which content hash last generated each local style preview.
 *
 * @returns Absolute manifest file path.
 */
export const getMapStylePreviewManifestPath = (): string =>
  path.join(MAP_STYLE_PREVIEW_DIR, 'manifest.json')
