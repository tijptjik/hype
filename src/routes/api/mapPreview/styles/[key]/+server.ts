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
// - isLocalPreviewRuntime
// - ensureLocalPreviewRuntime
//
// 2. PREVIEW RUNTIME
// - loadLocalPreviewRuntime
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
    throw error(404, 'Unknown map style preview')
  }

  return key
}

/**
 * Determines whether preview generation can use the local preview runtime.
 *
 * @param platform - SvelteKit platform bindings for the current request.
 * @returns `true` when running in development or the local Cloudflare environment.
 */
const isLocalPreviewRuntime = (platform?: App.Platform): boolean =>
  dev || platform?.env.ENVIRONMENT === 'local'

/**
 * Ensures preview generation endpoints stay local-only.
 *
 * @param platform - SvelteKit platform bindings for the current request.
 * @returns Nothing.
 * @remarks Throws a 404 outside local development runtimes.
 */
const ensureLocalPreviewRuntime = (platform?: App.Platform): void => {
  if (!isLocalPreviewRuntime(platform)) {
    throw error(404, 'Local preview generation is only available in development')
  }
}

// ---
/********************
 *  2. PREVIEW RUNTIME
 ************/
// +++ Preview Runtime

/**
 * Loads the local preview runtime on demand so production builds do not pull
 * in development-only preview generation code.
 *
 * @returns Local preview runtime module used by the preview API.
 */
const loadLocalPreviewRuntime = async () =>
  await import('$lib/map/styles/preview.local.server')

// ---
/********************
 *  3. ROUTE HANDLERS
 ************/
// +++ Route Handlers

/**
 * Returns the local preview generation status for a built-in map style.
 *
 * @param event - SvelteKit request event carrying the preview style key and platform bindings.
 * @returns JSON payload describing whether the preview exists or is queued locally.
 */
export const GET: RequestHandler = async ({ params, platform }) => {
  const key = requireMapStyleKey(params.key)
  ensureLocalPreviewRuntime(platform)

  const { doesMapStylePreviewExistLocally, isMapStylePreviewGenerationPendingLocally } =
    await loadLocalPreviewRuntime()

  return json({
    key,
    exists: await doesMapStylePreviewExistLocally(key),
    pending: isMapStylePreviewGenerationPendingLocally(key),
  })
}

/**
 * Triggers local preview generation for a built-in map style when no preview
 * artifact exists yet and no generation job is already running.
 *
 * @param event - SvelteKit request event carrying the preview style key, platform bindings, and origin URL.
 * @returns JSON payload describing the resulting local preview status.
 */
export const POST: RequestHandler = async ({ params, platform, url }) => {
  const key = requireMapStyleKey(params.key)
  ensureLocalPreviewRuntime(platform)

  const {
    doesMapStylePreviewExistLocally,
    isMapStylePreviewGenerationPendingLocally,
    triggerMapStylePreviewGenerationLocally,
  } = await loadLocalPreviewRuntime()

  const baseUrl = url.origin
  const exists = await doesMapStylePreviewExistLocally(key)
  const pending = isMapStylePreviewGenerationPendingLocally(key)

  if (!exists && !pending) {
    // Start a single local render job and let polling clients observe the pending state.
    triggerMapStylePreviewGenerationLocally(key, {
      baseUrl,
      ensureArtifacts: true,
      manageServer: false,
    })
  }

  return json({
    key,
    exists,
    pending: !exists || pending,
  })
}
