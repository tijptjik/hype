import path from 'node:path'

import {
  getMapStyleRenderObjectKey,
  getMapStyleRenderPublicPath,
} from './render.shared'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. LOCAL RENDER FILE HELPERS
//    - getMapStyleRenderFilePath
//    - getMapStyleRenderManifestPath

export const MAP_STYLE_RENDER_DIR = path.resolve('static', 'mapRender', 'styles')

export { getMapStyleRenderPublicPath }

/**
 * Resolves the on-disk output path for a local map-style render.
 *
 * @param code Map style code.
 * @returns Absolute output path under the local static asset directory.
 */
export const getMapStyleRenderFilePath = (code: string): string =>
  path.join(MAP_STYLE_RENDER_DIR, `${code}.png`)

/**
 * Resolves the manifest path used to track which content hash last generated each local style render.
 *
 * @returns Absolute manifest file path.
 */
export const getMapStyleRenderManifestPath = (): string =>
  path.join(MAP_STYLE_RENDER_DIR, 'manifest.json')
