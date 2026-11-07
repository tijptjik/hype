// VALIDATION
import { z } from 'zod'
// SEARCH
import { foldFeatureSearchText } from '#lib/features/search.js'

const tri = z.boolean().nullable().optional()
const locales = z.object({ en: tri, zhHans: tri, zhHant: tri }).strict()

/** Shared hierarchy and hub predicates, applied before pagination and counting. */
export const ResourceIndexFiltersSchema = z
  .object({
    isPublished: tri,
    isArchived: tri,
    hasName: tri,
    hasContextualName: tri,
    hasDescription: tri,
    hasImage: tri,
    isAllRightsReserved: tri,
    isPublicDomain: tri,
    hasLicenseBy: tri,
    hasLicenseSa: tri,
    hasLicenseNc: tri,
    hasLicenseNd: tri,
    translationLocales: z
      .object({ en: z.boolean(), zhHans: z.boolean(), zhHant: z.boolean() })
      .partial()
      .strict()
      .optional(),
    isNameTranslated: locales.optional(),
    isContextualNameTranslated: locales.optional(),
    isDescriptionTranslated: locales.optional(),
  })
  .strict()

export type ResourceIndexFilters = z.infer<typeof ResourceIndexFiltersSchema>
export type ResourceIndexType = 'organisation' | 'project' | 'layer' | 'hub'

/** Match literal text in the same fields as the authoritative resource query.
 * @param row Loaded resource used for an immediate preview.
 * @param query Current search input.
 * @returns Whether its identity, code, domain or localized content contains the search.
 */
export function matchesResourceIndexSearch(
  row: { id: string; code?: string; domain?: string | null; i18n?: unknown },
  query = '',
): boolean {
  const needle = foldFeatureSearchText(query.trim())
  const localized = Object.values(
    (row.i18n ?? {}) as Record<string, Record<string, unknown>>,
  ).flatMap(value => [value.name, value.nameShort, value.description])
  return [row.id, row.code, row.domain, ...localized].some(
    value => typeof value === 'string' && foldFeatureSearchText(value).includes(needle),
  )
}

type TaskSearchRelation = { id?: string; code?: string; i18n?: unknown }

/** Match the task queue's literal server search against already loaded relations.
 * @param row Task with its available feature and ancestor projections.
 * @param query Current search input.
 * @returns Whether one of the server-searchable fields contains the literal text.
 */
export function matchesTaskIndexSearch(
  row: {
    id: string
    featureId?: string | null
    message?: string | null
    contributor?: { name?: string | null } | null
    feature?: TaskSearchRelation | null
    project?: TaskSearchRelation | null
    organisation?: TaskSearchRelation | null
  },
  query = '',
): boolean {
  const needle = foldFeatureSearchText(query.trim())
  const text = (
    relation: TaskSearchRelation | null | undefined,
    fields: string[],
  ): unknown[] =>
    Object.values(
      (relation?.i18n ?? {}) as Record<string, Record<string, unknown>>,
    ).flatMap(locale => fields.map(field => locale[field]))
  const values = [
    row.id,
    row.featureId,
    row.message,
    row.contributor?.name,
    row.project?.id,
    row.project?.code,
    row.organisation?.id,
    row.organisation?.code,
    ...text(row.feature, ['title', 'description', 'displayAddress']),
    ...text(row.project, ['name', 'nameShort', 'description']),
    ...text(row.organisation, ['name', 'nameShort', 'description']),
  ]
  return values.some(
    value => typeof value === 'string' && foldFeatureSearchText(value).includes(needle),
  )
}
