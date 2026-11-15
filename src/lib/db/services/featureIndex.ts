// DRIZZLE
import { and, sql, type SQL } from 'drizzle-orm'
// API
import {
  getFeatureWithRelations,
  toListResponseShape,
} from '#lib/api/services/feature.js'
// LOCATION RELATIONSHIPS
import { locationFeatureCondition } from './locationFeatures.js'
// DB
import { feature, featureI18n } from '#lib/db/schema/index.js'
import { toOrderByWithLocalizedFields } from '#lib/db/index.js'
import {
  buildFeatureQueryConditions,
  buildFeatureRollupConditions,
  buildFeatureSearchMatch,
} from './featureQuery.js'
import {
  featureIndexFilterConditions,
  featureIndexLicenseConditions,
} from './featureIndexFilters.js'
import { getFeatureQueryCounts } from './featureCounts.js'
import { retryBusyRead } from './sqlite.js'
import { featureAuthoringSQL } from './featureAuthoringProjection.js'
import {
  featureLocationBrandCondition,
  featureLocationBrandsSQL,
} from './locationBrandProjection.js'
import { featureLocationNamesSQL } from './locationNameProjection.js'
import { featureLocationLifecycleSQL } from './locationLifecycleProjection.js'
import { featureIndoorUnitSQL } from './featureIndoorProjection'
// SEARCH
import { rankNearbyFeatures } from '#lib/features/nearby.js'
import { foldFeatureSearchText } from '#lib/features/search.js'
// I18N
import { contentStorageTag } from '#lib/i18n/contentRecords.js'
// TYPES
import type { Database, Locale } from '#lib/types.js'
import type { FeatureIndexQuery, FeatureIndexPage } from '#lib/features/indexQuery.js'
import type { FeatureQueryInput } from '#lib/api/services/featureQuery.types.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'

// TABLE OF CONTENTS
// 1. Search predicates
// 2. Authoritative page and count reads

/** Match the local literal substring search, using FTS candidates for translated text.
 * @param q Trimmed search text.
 * @param locale Current display locale, with the same English fallback as the client.
 * @returns A feature predicate; wildcard characters are literal, never LIKE syntax.
 * @remarks ID and contributor substring branches are scoped by the outer authorized query.
 */
export function featureIndexSearchCondition(q: string, locale: Locale): SQL {
  const search = foldFeatureSearchText(q)
  const storageLocale = contentStorageTag(locale)
  return sql`(
    instr(lower(${feature.id}), ${search}) > 0 or
    exists(select 1 from user u where u.id = ${feature.contributorId} and instr(lower(u.name), ${search}) > 0) or
    (${feature.id} in (select d.featureId from featureSearchFts join featureSearchDocument d on d.id = featureSearchFts.rowid
      where featureSearchFts match ${buildFeatureSearchMatch(search)}) and
      exists(select 1 from featureI18n fi where fi.featureId = ${feature.id}
        and fi.locale = case when exists(select 1 from featureI18n chosen where chosen.featureId = ${feature.id} and chosen.locale = ${storageLocale}) then ${storageLocale} else 'en' end
        and (instr(lower(fi.title), ${search}) > 0 or instr(lower(fi.description), ${search}) > 0 or instr(lower(fi.displayAddress), ${search}) > 0)))
  )`
}

/** Query one page and optionally its exact, revision-cached matching count.
 * @param db Request database.
 * @param input Validated prism, filters, search, sort and pagination.
 * @param authorizedConditions Trusted conditions from the ordinary feature list policy.
 * @param hub Trusted hub scope.
 * @param locale Display locale for sorting and search fallback.
 * @returns Authoritative matches; continuation pages omit count work entirely.
 * @remarks Counts hydrate no features. Only the bounded visible page loads relations.
 */
export async function queryFeatureIndex(
  db: Database,
  input: FeatureIndexQuery,
  authorizedConditions: SQL[],
  hub: HubOptsExtended,
  locale: Locale,
): Promise<FeatureIndexPage | FeatureIndexPage<{ id: string }>> {
  const queryInput: FeatureQueryInput = {
    meta: { isAdminRequest: true, scope: 'admin-index' },
  }
  const filters = [
    ...featureIndexFilterConditions(input.filters),
    ...(await featureIndexLicenseConditions(db, input.filters)),
  ]
  const conditions = buildFeatureQueryConditions(
    db,
    queryInput,
    [...authorizedConditions, ...filters],
    hub,
  )
  if (input.location)
    conditions.push(locationFeatureCondition(input.location.id, input.location.view))
  if (input.brandId) conditions.push(featureLocationBrandCondition(input.brandId))
  if (input.q) conditions.push(featureIndexSearchCondition(input.q, locale))
  // Nearby ranking scans only authorized IDs and geometry; hydrate the bounded page below.
  if (input.nearby) {
    const origin = input.nearby.coordinates
    const placements = await retryBusyRead(() =>
      db
        .select({ id: feature.id, geometry: feature.geometry })
        .from(feature)
        .where(and(...conditions)),
    )
    const ranked = rankNearbyFeatures(placements, origin, input.nearby.excludeId)
    const page = ranked.slice(
      input.pagination?.offset ?? 0,
      (input.pagination?.offset ?? 0) + (input.pagination?.limit ?? 5),
    )
    conditions.push(
      sql`${feature.id} in (select value from json_each(${JSON.stringify(page.map(row => row.id))}))`,
    )
    // Preserve exact geographic order without relying on SQLite trigonometry extensions.
    const result = await queryFeatureIndex(
      db,
      {
        ...input,
        nearby: undefined,
        pagination: { limit: input.pagination?.limit ?? 5, offset: 0 },
        includeCount: false,
      },
      conditions,
      hub,
      locale,
    )
    result.data.sort(
      (a, b) =>
        page.findIndex(row => row.id === a.id) - page.findIndex(row => row.id === b.id),
    )
    return { ...result, hasMore: false, nextOffset: null }
  }
  const source = sql`${feature}`
  // Relationship revisions have their own lifecycle; count them directly rather than using Feature-only revision caches.
  /** Count the current authorized relationship set. @returns Exact total without a stale relationship cache. */
  const locationCount = async (): Promise<{ totalCount: number }> => {
    const rows = await retryBusyRead(() =>
      db
        .select({ count: sql<number>`count(*)` })
        .from(source)
        .where(and(...conditions)),
    )
    return { totalCount: Number(rows[0]?.count ?? 0) }
  }
  // Count requests use the identical authorized predicate without reading any row relations.
  if (input.countOnly) {
    const counts =
      input.location || input.brandId
        ? await locationCount()
        : await getFeatureQueryCounts(
            db,
            queryInput,
            conditions,
            source,
            input.q
              ? null
              : buildFeatureRollupConditions(
                  db,
                  queryInput,
                  [...authorizedConditions, ...filters],
                  hub,
                ),
            false,
          )
    return { data: [], totalCount: counts.totalCount, hasMore: false, nextOffset: null }
  }
  const limit = input.pagination?.limit ?? 50
  const offset = input.pagination?.offset ?? 0
  const orderBy = toOrderByWithLocalizedFields({
    conditions: [],
    db,
    locale,
    sortBy: input.sorting?.sortBy ?? 'modifiedAt',
    sortOrder: input.sorting?.sortOrder ?? 'desc',
    fallbackColumn: feature.modifiedAt,
    baseTable: feature,
    localizedSortColumns: {
      title: featureI18n.title,
      description: featureI18n.description,
      displayAddress: featureI18n.displayAddress,
    },
    i18nTable: featureI18n,
    parentIdColumn: feature.id,
    foreignKeyColumn: featureI18n.featureId,
    localeColumn: featureI18n.locale,
  })
  // The count has no cursor/sort/limit in its cache key, and no geographic facet work.
  const [candidates, counts] = await Promise.all([
    retryBusyRead(() =>
      db
        .select({ id: feature.id })
        .from(feature)
        .where(and(...conditions))
        .orderBy(...orderBy)
        .limit(limit + 1)
        .offset(offset),
    ),
    input.includeCount === false
      ? Promise.resolve(null)
      : input.location || input.brandId
        ? locationCount()
        : getFeatureQueryCounts(
            db,
            queryInput,
            conditions,
            source,
            input.q
              ? null
              : buildFeatureRollupConditions(
                  db,
                  queryInput,
                  [...authorizedConditions, ...filters],
                  hub,
                ),
            false,
          ),
  ])
  const pageIds = candidates.slice(0, limit).map(row => row.id)
  const metadata = {
    totalCount: counts?.totalCount ?? null,
    hasMore: candidates.length > limit,
    nextOffset: candidates.length > limit ? offset + limit : null,
  }
  if (input.idsOnly) return { data: pageIds.map(id => ({ id })), ...metadata }
  if (!pageIds.length) return { data: [], ...metadata }
  // JSON membership is one binding regardless of page size; recheck authorization at hydration.
  const rows = await retryBusyRead(() =>
    db.query.feature.findMany({
      with: getFeatureWithRelations('admin') as never,
      extras: {
        locationBrands: featureLocationBrandsSQL().as('locationBrands'),
        locationNames: featureLocationNamesSQL().as('locationNames'),
        authoring: featureAuthoringSQL().as('authoring'),
        locationLifecycle: featureLocationLifecycleSQL().as('locationLifecycle'),
        indoorUnitId: featureIndoorUnitSQL().as('indoorUnitId'),
      },
      where: and(
        ...conditions,
        sql`${feature.id} in (select value from json_each(${JSON.stringify(pageIds)}))`,
      ),
    }),
  )
  const shaped = await toListResponseShape(
    {
      data: rows.sort((a, b) => pageIds.indexOf(a.id) - pageIds.indexOf(b.id)) as never,
      totalCount: metadata.totalCount ?? 0,
    },
    'admin',
  )
  // Index thumbnails need one image; full galleries remain owned by the detail endpoint.
  const data = input.summaryOnly
    ? shaped.data.map(item => {
        const { images, ...summary } = item
        const relations =
          (
            rows.find(row => row.id === item.id) as unknown as {
              images?: Array<{ isPublished?: boolean }>
            }
          )?.images ?? []
        return {
          ...summary,
          imageCount: relations.length,
          imagePublishedCount: relations.filter(image => image.isPublished).length,
        }
      })
    : shaped.data
  return { data, ...metadata }
}
