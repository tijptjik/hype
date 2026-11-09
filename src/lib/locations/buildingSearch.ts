// VALIDATION
import { z } from 'zod'
// SOURCES
import { loadBuildingNames, loadBuildingDetails } from '#lib/sources/saanseoi.js'
// ADDRESS
import { buildingNames } from '#lib/addresses/buildingNames.js'
import { normalizeNameSearch } from '#lib/addresses/nameSearch.js'
import { loadAddressNames } from '#lib/addresses/nameCatalogue.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { localAddressContent } from '#lib/addresses/locationDraft.js'
import { fillBuildingDetails } from '#lib/addresses/buildingSelection.js'
import { locationDistance } from './searchPresentation'
// TYPES
import type { LocaleKey } from '#lib/types.js'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'

export type BuildingSearchResult = {
  id: string
  kind: 'building'
  names: Record<string, string>
  address: FeatureAddress
  buildingSource: { id: string; release: string; addressId?: string }
}
/** Match names locally, then join only the matching buildings' release-pinned shards.
 * @param query Name text, in any published language.
 * @param locale Current editor language.
 * @param isCurrent Guard against fetching details for superseded queries.
 * @param options Name/proximity constraints, detail-fetch budget and optional publication-pinned page position.
 * @returns The requested building slice, or nearby exact matches, with each address alternative explicit.
 * @remarks No nearest-address guess or canonical association is created.
 */
export async function searchBuildingNames(
  query: string,
  locale: LocaleKey,
  isCurrent: () => boolean = () => true,
  options?: {
    exact?: boolean
    coordinates?: [number, number]
    maxDistance?: number
    candidateLimit?: number
    onLimited?: () => void
    offset?: number
    release?: string
    onPage?: (page: {
      release: string
      total: number
      nextOffset: number | null
    }) => void
  },
): Promise<BuildingSearchResult[]> {
  const [bundle, streets] = await Promise.all([
    loadBuildingNames(),
    loadAddressNames('streets').catch(() => []),
  ])
  if (!isCurrent()) return []
  if (options?.release && options.release !== bundle.release)
    throw new BuildingSearchPageError()
  const needle = normalizeNameSearch(query)
  if (!needle) return []
  const named = bundle.records
    .filter(row =>
      [row.name, ...Object.values(row.names)].some(
        name =>
          name &&
          (options?.exact
            ? normalizeNameSearch(name) === needle
            : normalizeNameSearch(name).includes(needle)),
      ),
    )
    .sort(
      (a, b) =>
        Number(
          [b.name, ...Object.values(b.names)].some(
            name => name && normalizeNameSearch(name) === needle,
          ),
        ) -
        Number(
          [a.name, ...Object.values(a.names)].some(
            name => name && normalizeNameSearch(name) === needle,
          ),
        ),
    )
  const limit = options?.candidateLimit ?? (options?.coordinates ? named.length : 10)
  const offset = options?.offset ?? 0
  if (options?.candidateLimit && named.length > offset + limit) options.onLimited?.()
  const matches = named.slice(offset, offset + limit)
  const groups = await Promise.all(
    matches.map(async row => {
      if (!isCurrent()) return []
      const details = await loadBuildingDetails(row.id, bundle.release)
      if (!isCurrent()) return []
      if (
        options?.coordinates &&
        locationDistance(options.coordinates, details.coordinates) >
          (options.maxDistance ?? 100)
      )
        return []
      const names = buildingNames(row.names, row.name)
      const building = { ...row, names, release: bundle.release }
      const candidates = details.addresses.length ? details.addresses : [undefined]
      return candidates.map(candidate => {
        const projected = fillBuildingDetails(
          emptyFeatureAddress(),
          building,
          details,
          candidate,
          false,
          locale,
          streets,
        )
        // Published building values are the reset baseline, not user corrections.
        const address = {
          ...projected,
          source: { ...projected.source, authored: localAddressContent(projected) },
          overrides: {},
        }
        return {
          id: `building:${row.id}:${candidate ? `${candidate.id}:${candidate.snapshotId}` : ''}`,
          kind: 'building' as const,
          names,
          buildingSource: {
            id: row.id,
            release: bundle.release,
            ...(candidate ? { addressId: candidate.id } : {}),
          },
          address,
        }
      })
    }),
  )
  options?.onPage?.({
    release: bundle.release,
    total: named.length,
    nextOffset: offset + matches.length < named.length ? offset + matches.length : null,
  })
  return groups.flat()
}

export class BuildingSearchPageError extends Error {
  readonly status = 410
  constructor() {
    super('Building search changed. Search again to refresh the results.')
  }
}
const buildingCursorSchema = z.strictObject({
  query: z.string(),
  locale: z.string(),
  release: z.string().min(1),
  offset: z.number().int().nonnegative(),
})
export type BuildingSearchPage = {
  rows: BuildingSearchResult[]
  total: number
  nextCursor: string | null
}

/** Fetch details for only the next ten matching buildings in a fixed name catalogue.
 * @param query Original name query.
 * @param locale Current editor language.
 * @param isCurrent Guard against obsolete detail fetches.
 * @param cursor Opaque query/publication-bound position from the previous page.
 * @returns All address alternatives for this building slice and an explicit continuation.
 * @remarks Alternatives are never split across pages; changed publications require restart.
 */
export async function searchBuildingNamesPage(
  query: string,
  locale: LocaleKey,
  isCurrent: () => boolean = () => true,
  cursor?: string,
): Promise<BuildingSearchPage> {
  let position: z.infer<typeof buildingCursorSchema> | undefined
  if (cursor) {
    try {
      position = buildingCursorSchema.parse(JSON.parse(decodeURIComponent(cursor)))
      if (position.query !== query || position.locale !== locale)
        throw new Error('Changed query')
    } catch {
      throw new BuildingSearchPageError()
    }
  }
  let total = 0
  let nextCursor: string | null = null
  const rows = await searchBuildingNames(query, locale, isCurrent, {
    offset: position?.offset,
    release: position?.release,
    candidateLimit: 10,
    onPage: page => {
      total = page.total
      nextCursor =
        page.nextOffset === null
          ? null
          : encodeURIComponent(
              JSON.stringify({
                query,
                locale,
                release: page.release,
                offset: page.nextOffset,
              }),
            )
    },
  })
  return { rows, total, nextCursor }
}
