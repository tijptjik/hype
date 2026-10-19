// CONTENTS: Binding contracts; bounded response parsing; durable leased refresh.
// ROUTING
import { calculateMtrAccess, mtrFeaturePoint, mtrRouteDistance } from './mtr'
// TYPES
import type { D1Database, D1DatabaseSession } from '@cloudflare/workers-types'

type RoutingResponse = {
  ok: boolean
  status: number
  body: {
    getReader(): {
      read(): Promise<{ done: boolean; value?: Uint8Array }>
      cancel(): Promise<void>
    }
  } | null
}
type RoutingBinding = {
  fetch(
    url: string,
    init?: {
      method?: string
      headers?: Record<string, string>
      body?: string
      signal?: AbortSignal
    },
  ): Promise<RoutingResponse>
}

export type MtrEnvironment = {
  DB: D1Database
  ROUTING_SERVICE?: RoutingBinding
  ROUTING_TOKEN?: string
}
type Job = { featureId: string; geometry: string; leaseUntil: number; attempts: number }

/**
 * Reads bounded routing JSON, rejecting oversized upstream payloads.
 * @param response - Routing service response.
 * @returns Parsed JSON without retaining an unbounded response body.
 */
async function routingJson(response: RoutingResponse): Promise<unknown> {
  if (!response.body) throw new Error('EMPTY_ROUTING_RESPONSE')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      if (!part.value) continue
      bytes += part.value.length
      if (bytes > 4 * 1024 * 1024) throw new Error('ROUTING_RESPONSE_TOO_LARGE')
      chunks.push(part.value)
    }
    const combined = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) {
      combined.set(chunk, offset)
      offset += chunk.length
    }
    return JSON.parse(new TextDecoder().decode(combined))
  } finally {
    await reader.cancel()
  }
}

/**
 * Processes one leased MTR calculation with coordinate-fenced persistence.
 * @param env - D1 and private routing bindings.
 * @param featureId - Optional newly edited feature; omission drains the oldest due job.
 * @param budgetMs - Total routing time budget for this invocation.
 * @returns Idle, completed or retry state; errors retain durable work.
 * @remarks Coordinates are never logged. The lease and source geometry fence both
 * result writes and job deletion so an older request cannot clear a newer edit.
 */
export async function refreshFeatureMtr(
  env: MtrEnvironment,
  featureId?: string,
  budgetMs = 25000,
): Promise<'idle' | 'completed' | 'retry'> {
  if (!env.ROUTING_SERVICE || !env.ROUTING_TOKEN) return 'idle'
  const db: D1DatabaseSession = env.DB.withSession('first-primary')
  const now = Date.now()
  const lease = now + budgetMs + 10000
  const job = await db
    .prepare(`UPDATE featureMtrJob SET leaseUntil=?,attempts=attempts+1
    WHERE featureId=(SELECT featureId FROM featureMtrJob WHERE retryAt<=? AND leaseUntil<=?
      AND (? IS NULL OR featureId=?) ORDER BY retryAt,featureId LIMIT 1)
    RETURNING featureId,geometry,leaseUntil,attempts`)
    .bind(lease, now, now, featureId ?? null, featureId ?? null)
    .first<Job>()
  if (!job) return 'idle'
  const signal = AbortSignal.timeout(budgetMs)
  const headers = {
    Authorization: `Bearer ${env.ROUTING_TOKEN}`,
    'X-Routing-Client': 'hype',
    'Content-Type': 'application/json',
  }
  try {
    const health = await env.ROUTING_SERVICE.fetch('https://routing.internal/health', {
      headers,
      signal,
    })
    if (!health.ok) throw new Error('ROUTING_UNAVAILABLE')
    const version = (await routingJson(health)) as { graphSha256?: string }
    if (!version.graphSha256) throw new Error('ROUTING_VERSION_MISSING')
    const result = await calculateMtrAccess(
      mtrFeaturePoint(JSON.parse(job.geometry)),
      async (origin, exit) => {
        if (signal.aborted) throw new Error('ROUTING_DEADLINE')
        const response = await env.ROUTING_SERVICE!.fetch(
          'https://routing.internal/route',
          {
            method: 'POST',
            headers,
            signal,
            body: JSON.stringify({
              locations: [
                { lon: origin[0], lat: origin[1] },
                { lon: exit.coordinates[0], lat: exit.coordinates[1] },
              ],
              costing: 'pedestrian',
            }),
          },
        )
        if (response.status === 429 || response.status >= 500)
          throw new Error('ROUTING_UNAVAILABLE')
        const payload = await routingJson(response)
        return mtrRouteDistance(payload, origin, exit.coordinates as [number, number])
      },
      version.graphSha256,
    )
    // D1 batch is atomic; a renewed geometry/lease makes both statements no-ops.
    await db.batch([
      db
        .prepare(`UPDATE feature SET mtrStation=?,mtrExit=?,mtrDistance=?,mtrResolution=?
        WHERE id=? AND geometry=? AND EXISTS (SELECT 1 FROM featureMtrJob WHERE featureId=? AND geometry=? AND leaseUntil=?)`)
        .bind(
          result.mtrStation,
          result.mtrExit,
          result.mtrDistance,
          JSON.stringify(result.mtrResolution),
          job.featureId,
          job.geometry,
          job.featureId,
          job.geometry,
          lease,
        ),
      db
        .prepare(
          'DELETE FROM featureMtrJob WHERE featureId=? AND geometry=? AND leaseUntil=?',
        )
        .bind(job.featureId, job.geometry, lease),
    ])
    return 'completed'
  } catch {
    await db
      .prepare(`UPDATE featureMtrJob SET leaseUntil=0,retryAt=?,lastError='ROUTING_RETRY'
      WHERE featureId=? AND geometry=? AND leaseUntil=?`)
      .bind(
        Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(job.attempts, 6)),
        job.featureId,
        job.geometry,
        lease,
      )
      .run()
    return 'retry'
  }
}
