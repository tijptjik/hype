// DOMAIN
import { readSaanSeoiPlacePage } from './sourceClient'
// TYPES
import type { PlacePublicationPin, PlaceSourceClient } from './sourceClient'
import type { SaanSeoiPlaceProjection } from './saanseoi'

type Page = Awaited<ReturnType<typeof readSaanSeoiPlacePage>>

/**
 * Find one canonical Place through the source API's ID-ordered, publication-pinned collection.
 * @param client Trusted endpoint, credentials and transport.
 * @param pin Publication discovered server-side and reused for every request.
 * @param ssId Exact candidate identity returned by source search.
 * @returns Verified source record and page offset, or null when absent from this publication.
 * @remarks SaanSeoi current/history collections sort IDs ascending. Enforce observed ordering,
 * dense pages, consistent totals/snapshots and a 24-page / 45-second request budget. Contract
 * drift fails explicitly; it never becomes a false empty search result. Latest-only detail
 * endpoints are not used as immutable canonical evidence. No source or Feature is written here.
 */
export async function findSaanSeoiPlace(
  client: PlaceSourceClient,
  pin: PlacePublicationPin,
  ssId: string,
): Promise<{ projection: SaanSeoiPlaceProjection; offset: number } | null> {
  if (!/^[\x20-\x7e]{1,200}$/.test(ssId)) throw new Error('Unsupported source identity')
  const deadline = AbortSignal.timeout(45_000)
  const bounded: PlaceSourceClient = {
    ...client,
    fetch: (input, init) =>
      client.fetch(input, {
        ...init,
        signal: AbortSignal.any([deadline, ...(init?.signal ? [init.signal] : [])]),
      }),
  }
  const pages = new Map<number, Page>()
  let total: number | null = null
  let snapshot: string | undefined

  /** Read/cache one dense page and verify every observed bound before discarding a search range. */
  async function page(index: number): Promise<Page> {
    const cached = pages.get(index)
    if (cached) return cached
    if (
      pages.size >= 24 ||
      !Number.isSafeInteger(index) ||
      index < 0 ||
      !Number.isSafeInteger(index * 100)
    )
      throw new Error('Place lookup page budget exceeded')
    if (deadline.aborted) throw new Error('Place lookup deadline exceeded')
    const value = await readSaanSeoiPlacePage(bounded, pin, index * 100)
    if (value.total !== null) {
      if (total !== null && total !== value.total)
        throw new Error('Place lookup total changed')
      total = value.total
    }
    const ids = value.places.map(record => record.ssId)
    if (ids.some((id, i) => !/^[\x20-\x7e]+$/.test(id) || (i > 0 && ids[i - 1] >= id)))
      throw new Error('Place collection is not strictly ID-ordered')
    if (
      (value.nextOffset !== null && ids.length !== 100) ||
      (total !== null && ids.length !== Math.min(100, Math.max(0, total - index * 100)))
    )
      throw new Error('Place lookup requires dense pages')
    for (const record of value.places) {
      snapshot ??= record.snapshotId
      if (record.snapshotId !== snapshot)
        throw new Error('Place lookup snapshot changed')
    }
    for (const [otherIndex, other] of pages) {
      if (!ids.length || !other.places.length) continue
      if (
        (otherIndex < index && other.places.at(-1)!.ssId >= ids[0]) ||
        (otherIndex > index && other.places[0].ssId <= ids.at(-1)!)
      )
        throw new Error('Place collection page ranges overlap or changed order')
    }
    pages.set(index, value)
    return value
  }

  const first = await page(0)
  if (!first.places.length || ssId < first.places[0].ssId) return null
  const firstMatch = first.places.find(record => record.ssId === ssId)
  if (firstMatch) return { projection: firstMatch, offset: 0 }
  if (ssId <= first.places.at(-1)!.ssId || first.nextOffset === null) return null
  let low = 1,
    high = first.total === null ? 1 : Math.ceil(first.total / 100) - 1
  // History may omit an exact count; find a bounded upper page before binary searching it.
  if (first.total === null) {
    while (true) {
      const upper = await page(high)
      if (
        !upper.places.length ||
        ssId <= upper.places.at(-1)!.ssId ||
        upper.nextOffset === null
      )
        break
      low = high + 1
      high *= 2
    }
  }
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const value = await page(middle)
    if (!value.places.length || ssId < value.places[0].ssId) {
      high = middle - 1
      continue
    }
    if (ssId > value.places.at(-1)!.ssId) {
      low = middle + 1
      continue
    }
    const projection = value.places.find(record => record.ssId === ssId)
    return projection ? { projection, offset: middle * 100 } : null
  }
  return null
}
