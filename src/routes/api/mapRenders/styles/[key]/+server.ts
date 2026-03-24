import { dev } from '$app/environment'
import { error, json, type RequestHandler } from '@sveltejs/kit'

import { isMapStyleKey } from '$lib/map/styles'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. PARAM AND RUNTIME GUARDS
// - requireMapStyleKey
// - isLocalRenderRuntime
// - ensureLocalRenderRuntime
//
// 2. PREVIEW RUNTIME
// - loadLocalRenderRuntime
//
// 3. ROUTE HANDLERS
// - GET
// - POST
// ---

// ---
/********************
 *  1. PARAM AND RUNTIME GUARDS
 ************/
// +++ Param And Runtime Guards

/**
 * Resolves the requested preview style key from the route params.
 *
 * @param key - Raw `[key]` route param value.
 * @returns Validated built-in map style key.
 * @remarks Throws a 404 when the key is missing or unknown.
 */
const requireMapStyleKey = (key: string | undefined): string => {
  if (!key || !isMapStyleKey(key)) {
    throw error(404, 'Unknown map style render')
  }

  return key
}

/**
 * Determines whether render generation can use the local render runtime.
 *
 * @param platform - SvelteKit platform bindings for the current request.
 * @returns `true` when running in development or the local Cloudflare environment.
 */
const isLocalRenderRuntime = (platform?: App.Platform): boolean =>
  dev || platform?.env.ENVIRONMENT === 'local'

/**
 * Ensures render generation endpoints stay local-only.
 *
 * @param platform - SvelteKit platform bindings for the current request.
 * @returns Nothing.
 * @remarks Throws a 404 outside local development runtimes.
 */
const ensureLocalRenderRuntime = (platform?: App.Platform): void => {
  if (!isLocalRenderRuntime(platform)) {
    throw error(404, 'Local render generation is only available in development')
  }
}

// ---
/********************
 *  2. PREVIEW RUNTIME
 ************/
// +++ Preview Runtime

/**
 * Loads the local render runtime on demand so production builds do not pull
 * in development-only render generation code.
 *
 * @returns Local render runtime module used by the preview API.
 */
const loadLocalRenderRuntime = async () =>
  await import('$lib/map/styles/render.local.server')

const getRemoteConfig = (platform?: App.Platform) => {
  const env = platform?.env

  if (
    !env?.CLOUDFLARE_ACCOUNT_ID ||
    !env.R2_S3_ACCESS_KEY_ID ||
    !env.R2_S3_SECRET_ACCESS_KEY
  ) {
    throw error(500, 'Map render persistence is not configured')
  }

  return {
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    accessKeyId: env.R2_S3_ACCESS_KEY_ID,
    secretAccessKey: env.R2_S3_SECRET_ACCESS_KEY,
  }
}

// ---
/********************
 *  3. ROUTE HANDLERS
 ************/
// +++ Route Handlers

/**
 * Returns the local render generation status for a built-in map style.
 *
 * @param event - SvelteKit request event carrying the preview style key and platform bindings.
 * @returns JSON payload describing whether the render exists or is queued locally.
 */
export const GET: RequestHandler = async ({ params, platform }) => {
  const key = requireMapStyleKey(params.key)
  ensureLocalRenderRuntime(platform)

  const { doesMapStyleRenderExistLocally, isMapStyleRenderGenerationPendingLocally } =
    await loadLocalRenderRuntime()
  const remoteConfig = getRemoteConfig(platform)

  return json({
    key,
    exists: await doesMapStyleRenderExistLocally(key, { remoteConfig, stage: 'local' }),
    pending: isMapStyleRenderGenerationPendingLocally(key),
  })
}

/**
 * Triggers local render generation for a built-in map style when no preview
 * artifact exists yet and no generation job is already running.
 *
 * @param event - SvelteKit request event carrying the preview style key, platform bindings, and origin URL.
 * @returns JSON payload describing the resulting local render status.
 */
export const POST: RequestHandler = async ({ params, platform, url }) => {
  const key = requireMapStyleKey(params.key)
  ensureLocalRenderRuntime(platform)

  const {
    doesMapStyleRenderExistLocally,
    isMapStyleRenderGenerationPendingLocally,
    triggerMapStyleRenderGenerationLocally,
  } = await loadLocalRenderRuntime()
  const remoteConfig = getRemoteConfig(platform)

  const baseUrl = url.origin
  const exists = await doesMapStyleRenderExistLocally(key, {
    remoteConfig,
    stage: 'local',
  })
  const pending = isMapStyleRenderGenerationPendingLocally(key)

  if (!exists && !pending) {
    // Start a single local render job and let polling clients observe the pending state.
    triggerMapStyleRenderGenerationLocally(key, {
      baseUrl,
      // Dev server startup already materializes map-style artifacts; rebuilding them
      // here rewrites static assets and triggers a full app reload.
      ensureArtifacts: false,
      manageServer: false,
      remoteConfig,
      stage: 'local',
    })
  }

  return json({
    key,
    exists,
    pending: !exists || pending,
  })
}
