// TYPES
import type {
  MapRenderAssetLocator,
  PreviewStage,
  MapRenderStorageMode,
} from '../../types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. STAGE / MODE RESOLUTION
//    - getMapRenderStage
//    - getMapRenderStorageMode
//
// 2. OBJECT KEY / URL RESOLUTION
//    - buildMapRenderObjectKey
//    - getMapRenderAssetBaseUrl
//    - resolveMapRenderAssetUrl

export const MAP_RENDER_ASSET_PATH_PREFIX = 'mapRender'

const MAP_RENDER_ASSET_BASE_URLS: Record<Exclude<PreviewStage, 'local'>, string> = {
  preview: 'https://assets.preview.hype.hk',
  production: 'https://assets.hype.hk',
}

/**
 * Normalises the app environment into the preview storage stage.
 *
 * @param environment Runtime environment value from Cloudflare or local dev.
 * @returns Preview stage used for URL and bucket resolution.
 */
export const getMapRenderStage = (environment?: string | null): PreviewStage => {
  if (environment === 'preview' || environment === 'production') {
    return environment
  }

  return 'local'
}

/**
 * Resolves whether previews should be served from local static files or R2.
 *
 * @param stage Preview stage returned by `getMapRenderStage`.
 * @returns Storage mode for the current environment.
 */
export const getMapRenderStorageMode = (stage: PreviewStage): MapRenderStorageMode =>
  stage === 'local' ? 'local-static' : 'r2'

/**
 * Builds the canonical object key for a generated preview asset.
 *
 * @param locator Preview asset location metadata.
 * @returns Immutable object key suitable for R2 and CDN caching.
 */
export const buildMapRenderObjectKey = ({
  kind,
  identifier,
  hash,
  extension = 'png',
}: MapRenderAssetLocator): string =>
  `${MAP_RENDER_ASSET_PATH_PREFIX}/${kind}/${identifier}/${hash}.${extension}`

/**
 * Resolves the public base URL for preview assets in remote environments.
 *
 * @param stage Preview stage returned by `getMapRenderStage`.
 * @returns Public asset base URL, or `null` for local static development.
 */
export const getMapRenderAssetBaseUrl = (stage: PreviewStage): string | null => {
  if (stage === 'local') {
    return null
  }

  return MAP_RENDER_ASSET_BASE_URLS[stage]
}

/**
 * Resolves a preview asset URL, falling back to a local static path in development.
 *
 * @param stage Preview stage returned by `getMapRenderStage`.
 * @param locator Canonical preview asset location metadata.
 * @param fallbackPath Local static asset path to use when stage is `local`.
 * @returns Public URL or path for the render image.
 */
export const resolveMapRenderAssetUrl = (
  stage: PreviewStage,
  locator: MapRenderAssetLocator,
  fallbackPath: string,
): string => {
  const baseUrl = getMapRenderAssetBaseUrl(stage)

  if (!baseUrl) {
    return fallbackPath
  }

  return `${baseUrl}/${buildMapRenderObjectKey(locator)}`
}
