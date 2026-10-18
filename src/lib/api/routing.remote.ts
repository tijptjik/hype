// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. ROUTING COMMANDS
// - routingEnvironment
// - warmRouting
// - calculateJourney
// ---

// SVELTE
import { command, getRequestEvent } from '$app/server'
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// API
import { getSessionOrError } from '#lib/api/index.js'
import { requestRouting, toJourney } from '#lib/api/services/routing.js'
import { routingRequestSchema } from '#lib/routing/routing.types.js'
// TYPES
import type { Journey } from '#lib/routing/routing.types.js'

/**
 * Requires a current session, including guests, and limits routing intent per user/IP.
 * @returns Request-local routing bindings after the access checks.
 * @remarks Coordinates are not persisted or used in cache keys, logs or URLs.
 */
async function routingEnvironment(): Promise<App.Platform['env']> {
  const event = getRequestEvent()
  const { user } = await getSessionOrError(event.locals)
  const env = event.locals.platform.env
  if (!env.ROUTING_LIMITER) throw error(503, 'Directions are not configured yet.')
  const keys = [`user:${user.id}`]
  const ip = event.request.headers.get('cf-connecting-ip')
  if (ip) keys.push(`ip:${ip}`)
  // Apply limits before a paid engine can be started or a route calculated.
  for (const key of keys) {
    const result = await env.ROUTING_LIMITER.limit({ key })
    if (!result.success)
      throw error(429, 'Too many directions requests. Please try again in a minute.')
  }
  return env
}

/**
 * Warms the shared engine as soon as the user requests directions.
 * @param _input - Empty intent payload; no location is needed.
 * @returns Readiness acknowledgement.
 */
export const warmRouting = command(
  z.object({}),
  async (_input): Promise<{ ready: true }> => {
    await requestRouting(await routingEnvironment(), '/warmup')
    return { ready: true }
  },
)

/**
 * Calculates a current-location-to-marker journey without retaining precise locations.
 * @param input - Validated Hong Kong endpoints and supported street mode.
 * @returns Route geometry, ordered instructions, distance, travel time and available monetary cost.
 * @remarks Commands avoid SvelteKit query caching of precise location payloads.
 */
export const calculateJourney = command(
  routingRequestSchema,
  async (input): Promise<Journey> => {
    const result = await requestRouting(await routingEnvironment(), '/route', input)
    return toJourney(result, input.mode)
  },
)
