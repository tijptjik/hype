// API
import { getDivisionGeometry } from '#lib/api/division.remote.js'
// TYPES
import type { DivisionGeometry } from '#lib/divisions/geometry.js'
import type { ResourceClient, ResourceDetail } from './resourceClient.svelte.js'

/**
 * Creates an inert geometry detail using the existing scoped native-query cache.
 * @param client Surface-owned resource capabilities.
 * @param id Stable division identity.
 * @returns A releasable detail; no polygon request occurs until load().
 */
export function divisionGeometryDetail(
  client: ResourceClient,
  id: string,
): ResourceDetail<DivisionGeometry> {
  return client.detail('division', { id, profile: 'geometry' }, () =>
    getDivisionGeometry({ id, meta: { scope: client.scopeKey } }),
  )
}
