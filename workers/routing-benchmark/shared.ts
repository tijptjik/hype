// TOC: Request validation | Benchmark responses
// RUNTIME
import { timingSafeEqual } from 'node:crypto'

export type Costing = 'pedestrian' | 'bicycle' | 'auto' | 'motor_scooter'
export type RouteRequest = {
  locations: { lat: number; lon: number; radius: 30; minimum_reachability: 0 }[]
  costing: Costing
  directions_options: { units: 'kilometers'; language: 'en-US' }
}

/**
 * Checks the benchmark credential without exposing a public routing service.
 * @param request - Incoming benchmark request.
 * @param secret - Deployed benchmark secret.
 * @returns Whether the caller supplied the matching credential.
 */
export async function authorized(request: Request, secret: string): Promise<boolean> {
  if (!secret) return false
  const encode = new TextEncoder()
  const supplied = await crypto.subtle.digest(
    'SHA-256',
    encode.encode(request.headers.get('authorization') ?? ''),
  )
  const expected = await crypto.subtle.digest(
    'SHA-256',
    encode.encode(`Bearer ${secret}`),
  )
  return timingSafeEqual(new Uint8Array(supplied), new Uint8Array(expected))
}

/**
 * Bounds and validates a two-point HK routing request for both engines.
 * @param request - Incoming JSON request.
 * @returns A normalized request with the same route options for both engines.
 * @remarks Deliberately excludes transit until a timetable graph is built.
 */
export async function parseRoute(request: Request): Promise<RouteRequest> {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('JSON body required')
  const bytes = new Uint8Array(4096)
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      if (size + next.value.length > bytes.length) throw new Error('Body exceeds 4 KiB')
      bytes.set(next.value, size)
      size += next.value.length
    }
  } finally {
    await reader.cancel()
  }
  const value = JSON.parse(new TextDecoder().decode(bytes.subarray(0, size)))
  if (!['pedestrian', 'bicycle', 'auto', 'motor_scooter'].includes(value.costing))
    throw new Error('Unsupported costing')
  if (!Array.isArray(value.locations) || value.locations.length !== 2)
    throw new Error('Exactly two locations required')
  for (const point of value.locations) {
    if (
      !Number.isFinite(point.lat) ||
      !Number.isFinite(point.lon) ||
      point.lat < 22.1 ||
      point.lat > 22.6 ||
      point.lon < 113.8 ||
      point.lon > 114.5
    ) {
      throw new Error('Coordinates outside HK benchmark coverage')
    }
  }
  return {
    locations: value.locations.map(({ lat, lon }: { lat: number; lon: number }) => ({
      lat,
      lon,
      radius: 30,
      minimum_reachability: 0,
    })),
    costing: value.costing,
    directions_options: { units: 'kilometers', language: 'en-US' },
  }
}

/**
 * Returns uncached JSON and an observable server duration.
 * @param value - Benchmark result or error.
 * @param status - HTTP result status.
 * @param elapsed - Server wall time in milliseconds.
 * @returns An uncached benchmark response.
 */
export function json(value: unknown, status = 200, elapsed = 0): Response {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Server-Timing': `routing;dur=${elapsed}` },
  })
}
