// TYPES
import type { PreviewAssetLocator, PreviewStage, PreviewStorageMode } from '../../types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. STAGE / MODE RESOLUTION
//    - getPreviewStage
//    - getPreviewStorageMode
//
// 2. OBJECT KEY / URL RESOLUTION
//    - buildPreviewObjectKey
//    - getPreviewAssetBaseUrl
//    - resolvePreviewAssetUrl

export const PREVIEW_ASSET_PATH_PREFIX = 'mapPreviews'

const PREVIEW_ASSET_BASE_URLS: Record<Exclude<PreviewStage, 'local'>, string> = {
  preview: 'https://assets.preview.hype.hk',
  production: 'https://assets.hype.hk',
}

/**
 * Normalises the app environment into the preview storage stage.
 *
 * @param environment Runtime environment value from Cloudflare or local dev.
 * @returns Preview stage used for URL and bucket resolution.
 */
export const getPreviewStage = (environment?: string | null): PreviewStage => {
  if (environment === 'preview' || environment === 'production') {
    return environment
  }

  return 'local'
}

/**
 * Resolves whether previews should be served from local static files or R2.
 *
 * @param stage Preview stage returned by `getPreviewStage`.
 * @returns Storage mode for the current environment.
 */
export const getPreviewStorageMode = (stage: PreviewStage): PreviewStorageMode =>
  stage === 'local' ? 'local-static' : 'r2'

/**
 * Builds the canonical object key for a generated preview asset.
 *
 * @param locator Preview asset location metadata.
 * @returns Immutable object key suitable for R2 and CDN caching.
 */
export const buildPreviewObjectKey = ({
  kind,
  identifier,
  hash,
  extension = 'png',
}: PreviewAssetLocator): string =>
  `${PREVIEW_ASSET_PATH_PREFIX}/${kind}/${identifier}/${hash}.${extension}`

/**
 * Resolves the public base URL for preview assets in remote environments.
 *
 * @param stage Preview stage returned by `getPreviewStage`.
 * @returns Public asset base URL, or `null` for local static development.
 */
export const getPreviewAssetBaseUrl = (stage: PreviewStage): string | null => {
  if (stage === 'local') {
    return null
  }

  return PREVIEW_ASSET_BASE_URLS[stage]
}

/**
 * Resolves a preview asset URL, falling back to a local static path in development.
 *
 * @param stage Preview stage returned by `getPreviewStage`.
 * @param locator Canonical preview asset location metadata.
 * @param fallbackPath Local static asset path to use when stage is `local`.
 * @returns Public URL or path for the preview image.
 */
export const resolvePreviewAssetUrl = (
  stage: PreviewStage,
  locator: PreviewAssetLocator,
  fallbackPath: string,
): string => {
  const baseUrl = getPreviewAssetBaseUrl(stage)

  if (!baseUrl) {
    return fallbackPath
  }

  return `${baseUrl}/${buildPreviewObjectKey(locator)}`
}
