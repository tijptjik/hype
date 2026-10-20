// DOMAIN
import { readSaanSeoiPlacePage } from './sourceClient'
// TYPES
import type { PlacePublicationPin, PlaceSourceClient } from './sourceClient'
import type { SaanSeoiPlaceProjection } from './saanseoi'

/**
 * Find one canonical Place using the publication-pinned collection's exact ID filter.
 * @param client Trusted endpoint, credentials and transport.
 * @param pin Publication discovered server-side and retained for this request.
 * @param ssId Exact canonical candidate identity returned by source search.
 * @returns Verified source record and zero page offset, or null when absent.
 * @remarks One bounded full-profile request replaces collection scans. The reader
 * requires the server to acknowledge the filter; older servers that ignore it fail
 * explicitly. Latest-only detail endpoints are not immutable canonical evidence.
 * This lookup never writes source data, links a Feature or adopts new values.
 */
export async function findSaanSeoiPlace(
  client: PlaceSourceClient,
  pin: PlacePublicationPin,
  ssId: string,
): Promise<{ projection: SaanSeoiPlaceProjection; offset: number } | null> {
  if (!/^[\x21-\x7e]{1,200}$/.test(ssId)) throw new Error('Unsupported source identity')
  const page = await readSaanSeoiPlacePage(client, pin, 0, { id: ssId })
  // Reject ignored/partial filters even when the requested ID happens to be in the page.
  if (
    page.places.length > 1 ||
    page.nextOffset !== null ||
    (page.total !== null && page.total !== page.places.length) ||
    page.places.some(record => record.ssId !== ssId)
  )
    throw new Error('Canonical Place lookup did not return an exact ID selection')
  return page.places[0] ? { projection: page.places[0], offset: 0 } : null
}
