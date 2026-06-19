import type { RequestHandler } from '@sveltejs/kit'
import { error } from '@sveltejs/kit'

import { isMapStyleKey } from '$lib/map/styles'
import { serveMapStyleByKey } from '$lib/map/styles/serve'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. PARAM GUARDS
// - requireMapStyleKeyParam
//
// 2. ROUTE HANDLERS
// - GET
// ---

// ---
/********************
 *  1. PARAM GUARDS
 ************/
// +++ Param Guards

/**
 * Resolves the requested map style key from the route params.
 *
 * @param key - Raw `[key]` route param value.
 * @returns Validated map style key string.
 * @remarks Throws a 404 when the route param is missing or invalid.
 */
const requireMapStyleKeyParam = (key: string | undefined): string => {
  if (!key || !isMapStyleKey(key)) {
    throw error(404, 'Unknown map style')
  }

  return key
}

// ---
/********************
 *  2. ROUTE HANDLERS
 ************/
// +++ Route Handlers

/**
 * Serves a built-in map style JSON document for a specific style key.
 *
 * @param event - SvelteKit request event carrying the style key param.
 * @returns Map style response for the resolved key.
 */
export const GET: RequestHandler = async ({ params, request }) => {
  const key = requireMapStyleKeyParam(params.key)

  return await serveMapStyleByKey(key, request)
}
