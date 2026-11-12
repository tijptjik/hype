// VALIDATION
import { z } from 'zod'
import { matchesPlaceTaxonomy } from './placeTaxonomy'

export const PlaceSearchFiltersSchema = z.strictObject({
  taxonomyCategory: z
    .string()
    .regex(/^[a-z0-9_]+$/)
    .max(200)
    .optional(),
  basicCategory: z
    .string()
    .regex(/^[a-z0-9_]+$/)
    .max(200)
    .optional(),
  taxonomyPrimary: z
    .string()
    .regex(/^[a-z0-9_]+$/)
    .max(200)
    .optional(),
  operatingStatus: z
    .enum(['open', 'temporarily_closed', 'permanently_closed', 'any'])
    .optional(),
})
export type PlaceSearchFilters = z.infer<typeof PlaceSearchFiltersSchema>

/** Check whether discovery is constrained by a category rather than status alone.
 * @param filters Accepted category and operating-status controls.
 * @returns Whether a category permits discovery without search text.
 */
export function hasPlaceSearchCategory(filters?: PlaceSearchFilters): boolean {
  return Boolean(
    filters?.basicCategory || filters?.taxonomyPrimary || filters?.taxonomyCategory,
  )
}

/** Encode the same exact category filters supported by SaanSeoi's Places collection.
 * @param filters Accepted search controls, never unvalidated URL fragments.
 * @returns Bounded query parameters combined with AND by the upstream API.
 */
export function placeSearchFilterParams(
  filters?: PlaceSearchFilters,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(PlaceSearchFiltersSchema.parse(filters ?? {}))
      .filter(
        (entry): entry is [string, string] =>
          Boolean(entry[1]) &&
          entry[0] !== 'taxonomyCategory' &&
          !(entry[0] === 'operatingStatus' && ['open', 'any'].includes(entry[1]!)),
      )
      .map(([key, value]) => [`filter[${key}]`, value]),
  )
}

/** Apply discovery filters before the source text search page limit.
 * @param filters Selected classification and user-facing status controls.
 * @returns Source filters for category ancestry and user-facing status semantics.
 * @remarks Requires the Places search API with open_or_unknown support. Collection
 * browsing retains its exact-category contract separately.
 */
export function placeTextSearchFilterParams(
  filters?: PlaceSearchFilters,
): Record<string, string> {
  const accepted = PlaceSearchFiltersSchema.parse(filters ?? {})
  const status = accepted.operatingStatus ?? 'open'
  return {
    ...placeSearchFilterParams(accepted),
    ...(accepted.taxonomyCategory
      ? { 'filter[taxonomyCategory]': accepted.taxonomyCategory }
      : {}),
    'filter[operatingStatus]': status === 'open' ? 'open_or_unknown' : status,
  }
}

/** Display publisher category identifiers without inventing a different taxonomy.
 * @param value Overture category identifier.
 * @returns A readable label; the original identifier remains the submitted value.
 */
export function placeCategoryLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase())
}

/** Apply user-facing status semantics and defend against ignored upstream filters.
 * @param filters Accepted filter selection. @param place Verified preview classification.
 * @returns Whether the place matches every selected condition.
 */
export function matchesPlaceSearchFilters(
  filters: PlaceSearchFilters | undefined,
  place: {
    basicCategory?: string | null
    taxonomyPrimary?: string | null
    operatingStatus?: string | null
  },
): boolean {
  const status = filters?.operatingStatus ?? 'open'
  const knownStatus =
    place.operatingStatus && place.operatingStatus !== 'unknown'
      ? place.operatingStatus
      : null
  return (
    (!filters?.basicCategory || place.basicCategory === filters.basicCategory) &&
    (!filters?.taxonomyPrimary || place.taxonomyPrimary === filters.taxonomyPrimary) &&
    (!filters?.taxonomyCategory ||
      matchesPlaceTaxonomy(filters.taxonomyCategory, place.taxonomyPrimary)) &&
    (status === 'any' ||
      (status === 'open'
        ? !knownStatus || knownStatus === 'open'
        : knownStatus === status))
  )
}
