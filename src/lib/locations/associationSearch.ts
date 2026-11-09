// API
import { searchDraftAssociationLocations } from '#lib/api/locationAssociation.remote.js'
import {
  searchDraftLocations,
  searchNearbyDraftLocations,
} from '#lib/api/draftLocation.remote.js'
// DOMAIN
import { searchBuildingNames } from './buildingSearch'
import { normalizeNameSearch } from '#lib/addresses/nameSearch.js'
import { locationDistance } from './searchPresentation'
// TYPES
import type { AssociationKind } from './association'
import type { DraftLocationSearchResult } from '#lib/bits/patterns/forms/featureLocation/draftLocationSearch.types.js'
import type { LocaleKey } from '#lib/types.js'

export type AssociationSearchInput = {
  kind: AssociationKind
  names: Record<string, string>
  coordinates: [number, number] | null
  projectId?: string
  locale: LocaleKey
  cached: DraftLocationSearchResult[]
}
export type AssociationSearchResult = {
  candidates: DraftLocationSearchResult[]
  incomplete: boolean
}

/** Match partial localized names inside the original 100 metre circle; never infer identity.
 * @param input Requested kind, names and pin. @param rows Candidate records.
 * @returns Deduplicated suggestions, ordered by distance and stable identity.
 */
export function filterAssociationCandidates(
  input: AssociationSearchInput,
  rows: DraftLocationSearchResult[],
): DraftLocationSearchResult[] {
  if (!input.coordinates) return []
  const names = Object.values(input.names).map(normalizeNameSearch).filter(Boolean)
  const unique = new Map<string, DraftLocationSearchResult>()
  for (const row of rows) {
    if (
      row.kind !== input.kind ||
      (!row.source && !row.buildingSource && !row.identity) ||
      !row.address.coordinates
    )
      continue
    if (locationDistance(input.coordinates, row.address.coordinates) > 100) continue
    const matches = Object.values(row.names)
      .map(normalizeNameSearch)
      .some(name =>
        names.some(
          query => name.includes(query) || (query.includes(name) && name.length > 1),
        ),
      )
    if (names.length && !matches) continue
    const key = row.identity?.ssId
      ? `place:${row.identity.ssId}`
      : row.source
        ? `place:${row.source.ssId}`
        : row.buildingSource
          ? `building:${row.buildingSource.id}:${row.buildingSource.addressId ?? ''}`
          : `location:${row.identity?.locationId ?? row.id}`
    if (!unique.has(key) || row.identity) unique.set(key, row)
  }
  return [...unique.values()].sort(
    (a, b) =>
      locationDistance(input.coordinates!, a.address.coordinates!) -
        locationDistance(input.coordinates!, b.address.coordinates!) ||
      a.id.localeCompare(b.id),
  )
}

/** Cross-reference existing Locations, Buildings and Places even when search filters hide them.
 * @param input Association lookup independent of initial discovery filters.
 * @returns Suggestions and explicit partial coverage; failures never become a complete no-match.
 */
export async function searchAssociationCandidates(
  input: AssociationSearchInput,
): Promise<AssociationSearchResult> {
  if (!input.coordinates || input.kind === 'address')
    return { candidates: [], incomplete: !input.coordinates }
  const jobs: Promise<{
    candidates: DraftLocationSearchResult[]
    incomplete: boolean
  }>[] = []
  if (input.projectId)
    jobs.push(
      Promise.resolve(
        searchDraftAssociationLocations({
          projectId: input.projectId,
          kind: input.kind,
          coordinates: input.coordinates,
        }),
      ).then(found => ({
        candidates: found.rows.map(row => ({
          id: `location:${row.locationId}`,
          kind: row.kind,
          recordMode: row.recordMode,
          names: row.facts.names,
          identity: {
            locationId: row.locationId,
            revisionId: row.revisionId,
            ...(row.ssId ? { ssId: row.ssId } : {}),
          },
          address: {
            version: 1,
            source: row.facts.location.address,
            coordinates: row.facts.location.geometry.coordinates,
            matchStatus: row.facts.location.address.status,
            overrides: {},
          },
        })),
        incomplete: found.limited,
      })),
    )
  const queries = [
    ...new Set(
      Object.values(input.names)
        .map(name => name.trim())
        .filter(Boolean),
    ),
  ]
  if (input.kind === 'building')
    for (const query of queries) {
      let limited = false
      // Short partial names must not fan out over the entire building detail catalogue.
      jobs.push(
        searchBuildingNames(query, input.locale, () => true, {
          coordinates: input.coordinates,
          maxDistance: 100,
          candidateLimit: 50,
          onLimited: () => {
            limited = true
          },
        }).then(candidates => ({ candidates, incomplete: limited })),
      )
    }
  if (input.kind === 'establishment') {
    // Nearby discovery prevents a common name elsewhere from exhausting the text result cap.
    const requests = [
      searchNearbyDraftLocations({ coordinates: input.coordinates, radius: 100 }),
      ...queries.map(q =>
        searchDraftLocations({
          q,
          locale:
            input.locale === 'zhHant'
              ? 'zh-hant'
              : input.locale === 'zhHans'
                ? 'zh-hans'
                : 'en',
        }),
      ),
    ]
    for (const request of requests)
      jobs.push(
        Promise.resolve(request).then(found => ({
          candidates: found.rows.map(row => ({
            id: `place:${row.id}`,
            kind: 'establishment' as const,
            names: row.facts.names,
            source: { ssId: row.id, resourceReleaseId: row.resourceReleaseId },
            address: {
              version: 1 as const,
              source: row.facts.location.address,
              coordinates: row.facts.location.geometry.coordinates,
              matchStatus: row.facts.location.address.status,
              overrides: {},
            },
          })),
          incomplete: found.partial || found.limited,
        })),
      )
  }
  const results = await Promise.allSettled(jobs)
  return {
    candidates: filterAssociationCandidates(input, [
      ...input.cached,
      ...results.flatMap(result =>
        result.status === 'fulfilled' ? result.value.candidates : [],
      ),
    ]),
    incomplete:
      !jobs.length ||
      results.some(result => result.status === 'rejected' || result.value.incomplete),
  }
}
