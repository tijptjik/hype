// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. ROUTING SERVICE
// - toJourney
// - requestRouting
// ---

// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// ROUTING
import { decodePolyline6 } from '#lib/routing/routeGeometry.js'
// TYPES
import type {
  AbortSignal as WorkerAbortSignal,
  Response as WorkerResponse,
} from '@cloudflare/workers-types'
import type {
  Journey,
  RoutingMode,
  RoutingRequest,
} from '#lib/routing/routing.types.js'

const measure = z.number().finite().nonnegative()
const summary = z.object({
  time: measure,
  length: measure,
  has_ferry: z.boolean().optional(),
})
const nativeRouteSchema = z.object({
  native: z.object({
    trip: z.object({
      status: z.literal(0),
      units: z.literal('kilometers'),
      summary,
      legs: z
        .array(
          z.object({
            shape: z.string().min(1).max(2000000),
            maneuvers: z.array(
              z.object({
                instruction: z.string(),
                begin_shape_index: z.number().int().nonnegative(),
                end_shape_index: z.number().int().nonnegative(),
                time: measure,
                length: measure,
              }),
            ),
          }),
        )
        .min(1),
    }),
  }),
})

/**
 * Converts native routing units into the application's journey contract.
 * @param payload - Untrusted native Worker JSON.
 * @param mode - Validated requested street profile.
 * @returns Native leg geometry, metres, seconds and ordered journey instructions.
 * @remarks Valhalla's optimization cost is not money. Motorized and ferry costs remain unknown.
 */
export function toJourney(payload: unknown, mode: RoutingMode): Journey {
  const parsed = nativeRouteSchema.safeParse(payload)
  if (!parsed.success)
    throw error(502, 'The routing service returned an invalid journey.')
  const trip = parsed.data.native.trip
  const hasFerry = trip.summary.has_ferry ?? false
  // Preserve native leg boundaries and reject malformed shapes before returning map geometry.
  let coordinates: ReturnType<typeof decodePolyline6>[]
  try {
    coordinates = trip.legs.map(leg => decodePolyline6(leg.shape))
  } catch {
    throw error(502, 'The routing service returned an invalid route shape.')
  }
  return {
    geometry: { type: 'MultiLineString', coordinates },
    mode,
    seconds: trip.summary.time,
    metres: trip.summary.length * 1000,
    cost: {
      currency: 'HKD',
      amount: !hasFerry && (mode === 'pedestrian' || mode === 'bicycle') ? 0 : null,
    },
    segments: trip.legs.flatMap((leg, legIndex) =>
      leg.maneuvers.map(step => {
        const positions = coordinates[legIndex]
        const begin = step.begin_shape_index
        const end = step.end_shape_index
        // Native maneuver indices are inclusive and local to this leg.
        if (begin > end || end >= positions.length)
          throw error(502, 'The routing service returned an invalid journey segment.')
        return {
          geometry:
            begin === end
              ? { type: 'Point' as const, coordinates: positions[begin] }
              : {
                  type: 'LineString' as const,
                  coordinates: positions.slice(begin, end + 1),
                },
          instruction: step.instruction,
          seconds: step.time,
          metres: step.length * 1000,
          mode,
        }
      }),
    ),
    calculatedAt: new Date().toISOString(),
    hasFerry,
  }
}

/**
 * Calls the private routing Worker through a Cloudflare service binding.
 * @param env - Request-local bindings and server-only credential.
 * @param path - Allowed routing operation.
 * @param route - Optional validated route parameters.
 * @returns Parsed upstream response without benchmark telemetry.
 */
export async function requestRouting(
  env: App.Platform['env'],
  path: '/warmup' | '/route',
  route?: RoutingRequest,
): Promise<unknown> {
  if (!env.ROUTING_SERVICE || !env.ROUTING_TOKEN) {
    throw error(503, 'Directions are not configured yet. Please try again later.')
  }
  let response: WorkerResponse
  try {
    response = await env.ROUTING_SERVICE.fetch(`https://routing.internal${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.ROUTING_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: route
        ? JSON.stringify({
            locations: [route.origin, route.destination],
            costing: route.mode,
          })
        : undefined,
      // Workers and DOM declarations differ; this is the same native AbortSignal at runtime.
      signal: AbortSignal.timeout(30000) as WorkerAbortSignal,
    })
  } catch {
    throw error(503, 'Directions could not be loaded. Please try again.')
  }
  if (!response.ok) {
    await response.body?.cancel()
    if (response.status === 400 && path === '/route') {
      throw error(404, 'No route was found for this transport mode. Try another mode.')
    }
    throw error(503, 'Directions could not be loaded. Please try again.')
  }
  try {
    return await response.json()
  } catch {
    throw error(502, 'The routing service returned an invalid response.')
  }
}
