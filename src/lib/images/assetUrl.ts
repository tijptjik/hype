// SVELTE
import { PUBLIC_ASSET_BASE_URL, PUBLIC_PREVIEW_ASSET_BASE_URL } from '$app/env/public'
// UTILS
import { resolveAppStage } from '#lib'
// TYPES
import type { PreviewStage } from '#lib/map/renders/render.types.js'

const DEFAULT_PUBLIC_ASSET_BASE_URL = 'https://assets.hype.hk'

const DEFAULT_PUBLIC_PREVIEW_ASSET_BASE_URL = 'https://assets.preview.hype.hk'
const DEFAULT_LOCAL_ASSET_BASE_URL = 'http://assets.hype.localhost'

const resolvePublicAssetBaseUrl = (): string => {
  const configuredBaseUrl =
    PUBLIC_ASSET_BASE_URL || import.meta.env.PUBLIC_ASSET_BASE_URL || ''

  if (configuredBaseUrl) {
    return configuredBaseUrl
  }

  return DEFAULT_PUBLIC_ASSET_BASE_URL
}

const resolvePreviewAssetBaseUrl = (): string => {
  const configuredBaseUrl =
    PUBLIC_PREVIEW_ASSET_BASE_URL || import.meta.env.PUBLIC_PREVIEW_ASSET_BASE_URL || ''

  if (configuredBaseUrl) {
    return configuredBaseUrl
  }

  return DEFAULT_PUBLIC_PREVIEW_ASSET_BASE_URL
}

/**
 * Resolves the upload stage for the current client session.
 *
 * @param params Optional overrides for tests and non-browser contexts.
 * @returns Stage whose raw bucket should receive the new upload.
 * @remarks Runtime public env is preferred over build-time env because local
 * dev sessions can inject different public asset hosts via Wrangler `.dev.vars`.
 */
export const resolveImageUploadEnv = (params?: {
  appOrigin?: string
  assetBaseUrl?: string
}): PreviewStage => {
  const appOrigin =
    params?.appOrigin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const appStage = resolveAppStage(appOrigin)

  if (appStage !== 'local') {
    return appStage
  }

  return resolveAppStage(params?.assetBaseUrl ?? resolvePublicAssetBaseUrl())
}

/**
 * Resolves the correct asset host for an image based on its persisted stage.
 *
 * @param stage Image environment stored on the image record.
 * @param appOrigin Optional application origin for non-browser callers and tests.
 * @returns Public asset base URL that can serve that image stage.
 * @remarks A configured local worker handles every storage stage during local development.
 */
export const resolveImageAssetBaseUrl = (
  stage?: PreviewStage,
  appOrigin?: string,
): string => {
  const hasConfiguredAssetBaseUrl = Boolean(
    PUBLIC_ASSET_BASE_URL || import.meta.env.PUBLIC_ASSET_BASE_URL,
  )
  const assetBaseUrl = resolvePublicAssetBaseUrl()
  const configuredStage = resolveAppStage(assetBaseUrl)
  const runtimeAppOrigin =
    appOrigin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const runtimeAppStage = resolveAppStage(runtimeAppOrigin)

  // Exercise the local delivery code while retaining the image's persisted bucket stage.
  if (
    runtimeAppStage === 'local' &&
    (configuredStage === 'local' || !hasConfiguredAssetBaseUrl)
  ) {
    const localBaseUrl = hasConfiguredAssetBaseUrl
      ? assetBaseUrl
      : DEFAULT_LOCAL_ASSET_BASE_URL
    return stage === 'preview' || stage === 'production'
      ? `${localBaseUrl.replace(/\/+$/, '')}/${stage}`
      : localBaseUrl
  }

  if (stage === 'preview') {
    return configuredStage === 'preview' ? assetBaseUrl : resolvePreviewAssetBaseUrl()
  }

  if (stage === 'production') {
    return configuredStage === 'production'
      ? assetBaseUrl
      : DEFAULT_PUBLIC_ASSET_BASE_URL
  }

  if (runtimeAppStage === 'local' && configuredStage === 'production') {
    return DEFAULT_LOCAL_ASSET_BASE_URL
  }

  return assetBaseUrl
}
