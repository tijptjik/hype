// DRIZZLE
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  inArray,
  lt,
  not,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
// API
import {
  getFeatureWithRelations,
  toListResponseShape,
} from '#lib/api/services/feature.js'
// DB
import {
  feature,
  featureI18n,
  featureProperty,
  layer,
  project,
  organisation,
  userFeature,
} from '#lib/db/schema/index.js'
import { featureSearchDocument } from '#lib/db/schema/featureQuery.js'
import { getFeatureHubFilter } from './hub'
import { retryBusyRead } from './sqlite'
import { getFeatureQueryCounts } from './featureCounts'
// UTILS
import { chunkedInArray } from '#lib/utils/batch-query.js'
// TYPES
import type { Database } from '#lib/types.js'
import type {
  FeatureQueryInput,
  FeatureQueryPage,
} from '#lib/api/services/featureQuery.types.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'
import type { FeatureListDBRaw } from '#lib/db/zod/schema/feature.types.js'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. QUERY PREDICATES
// - featureQuerySignature
// - buildFeatureQuerySource
// - buildFeaturePrismConditions
// - serializeActivePropertyFilters
// - buildFeatureSearchMatch
// - buildFeatureQueryConditions
// - buildFeatureRollupConditions
// 2. PAGED READS
// - queryFeaturePage
// ---
/********************
 *  1. QUERY PREDICATES
 ************/
// +++ Query Predicates

/**
 * Binds a cursor to every filter and authorization cache discriminator.
 * @param input - Query identity, excluding traversal position.
 * @returns Fixed-size SHA-256 signature for a repeated request with the same payload.
 * @remarks The cursor carries only the digest, so large filters and viewport exclusions
 * are transmitted once instead of being copied into every subsequent cursor.
 */
export async function featureQuerySignature(input: FeatureQueryInput): Promise<string> {
  const identity = JSON.stringify({
    sorting: input.sorting ?? { sortBy: 'id', sortOrder: 'asc' },
    q: input.q ?? '',
    prisms: input.prisms ?? {},
    filters: input.filters ?? {},
    spatial: input.spatial ?? null,
    excludeIds: input.excludeIds ?? [],
    meta: input.meta,
  })
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(identity),
  )
  return [...new Uint8Array(digest)]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Chooses the covering index appropriate to the query's candidate membership.
 * @param input - Complete validated query identity.
 * @returns An indexed feature source for ID-driven or visibility-driven reads.
 * @remarks SQLite otherwise sometimes chooses a broad visibility index even when a
 * tiny H3/search/list candidate set is available. Explicit index choice keeps those
 * reads proportional to the candidate set without fetching feature payload columns.
 */
export function buildFeatureQuerySource(input: FeatureQueryInput): SQL {
  const hasCandidates =
    input.spatial ||
    input.q ||
    input.filters?.list ||
    input.filters?.divisionIds?.length
  return hasCandidates
    ? sql`${feature} indexed by feature_query_id_idx`
    : sql`${feature} indexed by feature_query_visibility_idx`
}

/**
 * Resolves the existing deepest-selected prism semantics through layer membership.
 * @param db - Request database.
 * @param prisms - Selected organisation, project and layer identifiers.
 * @returns Feature layer predicates equivalent to the shared feature-prism hierarchy.
 * @remarks A selected descendant narrows its ancestor branch; independent branches
 * remain a union. Resolving layers avoids visiting every feature to establish scope.
 */
export function buildFeaturePrismConditions(
  db: Database,
  prisms: FeatureQueryInput['prisms'],
): SQL[] {
  const layerIds = prisms?.layer ?? []
  const projectIds = prisms?.project ?? []
  const organisationIds = prisms?.organisation ?? []
  if (!layerIds.length && !projectIds.length && !organisationIds.length) return []

  const selectedLayerProjects = db
    .select({ id: layer.projectId })
    .from(layer)
    .where(chunkedInArray(layer.id, layerIds))
  const selectedProjectOrganisations = db
    .select({ id: project.organisationId })
    .from(project)
    .where(chunkedInArray(project.id, projectIds))
  const selectedLayerOrganisations = db
    .select({ id: project.organisationId })
    .from(layer)
    .innerJoin(project, eq(layer.projectId, project.id))
    .where(chunkedInArray(layer.id, layerIds))
  const allowedLayers = db
    .select({ id: layer.id })
    .from(layer)
    .innerJoin(project, eq(layer.projectId, project.id))
    .innerJoin(organisation, eq(project.organisationId, organisation.id))
    .where(
      or(
        chunkedInArray(layer.id, layerIds),
        and(
          chunkedInArray(project.id, projectIds),
          notInArray(project.id, selectedLayerProjects),
        ),
        and(
          chunkedInArray(organisation.id, organisationIds),
          notInArray(organisation.id, selectedProjectOrganisations),
          notInArray(organisation.id, selectedLayerOrganisations),
        ),
      ),
    )
  return [inArray(feature.layerId, allowedLayers)]
}

/**
 * Packs only active layer/property filters into one SQL parameter.
 * @param properties - Layer-scoped selected values, booleans and range controls.
 * @returns JSON tuples of layer, property and filter, or null when all controls are inactive.
 * @remarks Empty selections and full-range defaults do not require a persisted property.
 * Packing tuples also keeps arbitrary identifiers out of SQL paths and statement text.
 */
function serializeActivePropertyFilters(
  properties: NonNullable<FeatureQueryInput['filters']>['properties'],
): string | null {
  const active = Object.entries(properties ?? {}).flatMap(([layerId, entries]) =>
    Object.entries(entries)
      .filter(([, value]) => {
        if (Array.isArray(value)) return value.length > 0
        if (typeof value === 'boolean') return true
        return value.rangeMin !== value.globalMin || value.rangeMax !== value.globalMax
      })
      .map(([propertyId, value]) => [layerId, propertyId, value]),
  )
  return active.length ? JSON.stringify(active) : null
}

/**
 * Encodes literal substring candidates as an FTS expression with no user syntax.
 * @param search - Search text with SQLite-compatible ASCII case folding applied.
 * @returns A single bound MATCH expression requiring every distinct trigram, or a short gram.
 * @remarks Migration 0081 indexes UTF-8 hex tokens for one through three Unicode
 * codepoints. Hex preserves punctuation, accents and short CJK terms through the
 * FTS tokenizer. Exact source checks still verify order and field boundaries.
 */
function buildFeatureSearchMatch(search: string): string {
  const characters = Array.from(search)
  const size = Math.min(3, characters.length)
  const encoder = new TextEncoder()
  const tokens = new Set<string>()

  // Intersect all query grams inside FTS before examining any source text.
  for (let position = 0; position <= characters.length - size; position++) {
    const gram = characters.slice(position, position + size).join('')
    tokens.add(
      Array.from(encoder.encode(gram), byte => byte.toString(16).padStart(2, '0')).join(
        '',
      ),
    )
  }
  return [...tokens].join(' AND ')
}

/**
 * Composes indexed membership predicates with the caller's authorized scope.
 * @param db - Request database.
 * @param input - Validated filters; user-list ownership is resolved by the remote boundary.
 * @param authorizedConditions - Existing feature authorization and prism predicates.
 * @param hub - Trusted request hub options.
 * @returns Count-safe predicates without a page cursor.
 * @remarks Dynamic arrays use one JSON binding each. Search uses one bound FTS
 * expression even for one-character CJK queries; exact text checks only examine candidates.
 */
export function buildFeatureQueryConditions(
  db: Database,
  input: FeatureQueryInput,
  authorizedConditions: SQL[],
  hub: HubOptsExtended,
): SQL[] {
  const conditions = [...authorizedConditions]
  const hubFilter = getFeatureHubFilter(db, hub)
  if (hubFilter) conditions.push(hubFilter)
  const filters = input.filters

  // Cell membership and optional exact viewport bounds remain composable with every filter.
  if (input.spatial) {
    const { resolution, cells, bounds } = input.spatial
    const spatialConditions: SQL[] = [
      sql`"resolution" = ${resolution}`,
      sql`"cell" in (select value from json_each(${JSON.stringify(cells)}))`,
    ]
    if (bounds) {
      const [west, south, east, north] = bounds
      spatialConditions.push(sql`"latitude" >= ${south} and "latitude" <= ${north}`)
      spatialConditions.push(
        west <= east
          ? sql`"longitude" >= ${west} and "longitude" <= ${east}`
          : sql`("longitude" >= ${west} or "longitude" <= ${east})`,
      )
    }
    conditions.push(
      sql`${feature.id} in (select "featureId" from "featureSpatial" indexed by featureSpatial_cell_layer_idx where ${and(...spatialConditions)})`,
    )
  }

  if (input.q) {
    // SQLite lower() preserves the existing ASCII case folding and CJK substring semantics.
    const search = input.q.replace(/[A-Z]/g, character => character.toLowerCase())
    const match = buildFeatureSearchMatch(search)
    conditions.push(
      inArray(
        feature.id,
        db
          .select({ id: featureSearchDocument.featureId })
          .from(sql`featureSearchFts`)
          .innerJoin(
            featureSearchDocument,
            sql`${featureSearchDocument.id} = featureSearchFts.rowid`,
          )
          .where(sql`featureSearchFts match ${match}`),
      ),
    )
    conditions.push(
      exists(
        db
          .select({ id: featureI18n.featureId })
          .from(featureI18n)
          .where(
            and(
              eq(featureI18n.featureId, feature.id),
              sql`(
        instr(lower(${featureI18n.title}), ${search}) > 0 or
        instr(lower(${featureI18n.description}), ${search}) > 0 or
        instr(lower(${featureI18n.displayAddress}), ${search}) > 0)`,
            ),
          ),
      ),
    )
  }

  if (filters?.isVisitable !== undefined)
    conditions.push(eq(feature.isVisitable, filters.isVisitable))
  if (filters?.isIntangible !== undefined)
    conditions.push(eq(feature.isIntangible, filters.isIntangible))
  if (filters?.list?.userId) {
    const listColumn =
      filters.list.listId === 'wishlist'
        ? userFeature.isWishlisted
        : userFeature.isVisited
    conditions.push(
      inArray(
        feature.id,
        db
          .select({ id: userFeature.featureId })
          .from(userFeature)
          .where(
            and(eq(userFeature.userId, filters.list.userId), eq(listColumn, true)),
          ),
      ),
    )
  }

  const activeProperties = serializeActivePropertyFilters(filters?.properties)
  if (activeProperties) {
    // Check each candidate by the (featureId, propertyId) primary key, regardless of filter count.
    // JSON numeric validation prevents SQLite CAST from treating arbitrary text as zero.
    const propertyMatches = db
      .select({ id: featureProperty.featureId })
      .from(featureProperty)
      .where(
        and(
          eq(featureProperty.featureId, feature.id),
          sql`${featureProperty.propertyId} = json_extract("requestedProperty"."value", '$[1]')`,
          sql`case json_type("requestedProperty"."value", '$[2]')
        when 'array' then ${featureProperty.propertyValueId} in (
          select value from json_each("requestedProperty"."value", '$[2]')
        )
        when 'true' then ${featureProperty.value} in ('true', '1')
        when 'false' then ${featureProperty.value} in ('false', '0')
        when 'object' then (
          case when json_valid(${featureProperty.value}) then json_type(${featureProperty.value}) in ('integer', 'real') else 0 end
          and cast(${featureProperty.value} as real) >= json_extract("requestedProperty"."value", '$[2].rangeMin')
          and cast(${featureProperty.value} as real) <= json_extract("requestedProperty"."value", '$[2].rangeMax')
        )
        else 0 end`,
        ),
      )
    conditions.push(sql`not exists (
      select 1 from json_each(${activeProperties}) as "requestedProperty"
      where json_extract("requestedProperty"."value", '$[0]') = ${feature.layerId}
        and not ${exists(propertyMatches)}
    )`)
  }

  // Membership lookup uses one JSON bind and never doubles features across selected ancestors.
  if (filters?.divisionIds?.length)
    conditions.push(sql`${feature.id} in (
      select featureId from featureDivisionMembership where selected=1
      and divisionId in (select value from json_each(${JSON.stringify(filters.divisionIds)}))
    )`)
  if (filters?.excludeDivisionIds?.length)
    conditions.push(sql`${feature.id} not in (
      select featureId from featureDivisionMembership where selected=1
      and divisionId in (select value from json_each(${JSON.stringify(filters.excludeDivisionIds)}))
    )`)
  return conditions
}

/**
 * Reuses safe feature predicates against maintained bins without duplicating authorization.
 * @param db - Request database.
 * @param input - Filter identity; pages and exclusions do not alter count membership.
 * @param authorizedConditions - Trusted role/prism predicates.
 * @param hub - Trusted hub options.
 * @returns Rollup-compatible predicates, or null when detailed feature matching is required.
 * @remarks Bin columns preserve every feature-level scope and status field. A future
 * authorization predicate referencing unsupported columns automatically falls back to
 * the revision-cached aggregate instead of broadening the rollup's visibility scope.
 */
export function buildFeatureRollupConditions(
  db: Database,
  input: FeatureQueryInput,
  authorizedConditions: SQL[],
  hub: HubOptsExtended,
): SQL[] | null {
  if (
    input.q ||
    input.spatial ||
    input.filters?.list ||
    input.filters?.divisionIds?.length ||
    serializeActivePropertyFilters(input.filters?.properties)
  )
    return null
  const conditions = buildFeatureQueryConditions(
    db,
    {
      ...input,
      filters: {
        isVisitable: input.filters?.isVisitable,
        isIntangible: input.filters?.isIntangible,
      },
    },
    authorizedConditions,
    hub,
  )
  const probe = db
    .select({ count: sql`count(*)` })
    .from(feature)
    .where(and(...conditions))
    .toSQL()
  const supported = new Set([
    'organisationId',
    'projectId',
    'layerId',
    'isPublished',
    'isArchived',
    'isDraft',
    'isVisitable',
    'isIntangible',
  ])
  if (
    [...probe.sql.matchAll(/"?feature"?\."?([A-Za-z][A-Za-z0-9_]*)"?/g)].some(
      match => !supported.has(match[1]),
    )
  )
    return null

  if (input.filters?.excludeDivisionIds?.length) return null
  return conditions
}

// ---
/********************
 *  2. PAGED READS
 ************/
// +++ Paged Reads

/**
 * Returns one bounded feature page and exact server totals for the complete query.
 * @param db - Request database.
 * @param input - Validated and authorized query identity.
 * @param authorizedConditions - Visibility/prism/role predicates from the shared authorization service.
 * @param hub - Trusted request hub scope.
 * @param actorUserId - Trusted session user whose own list states accompany the page.
 * @returns Hydrated list records, matching total, localized division facets and next cursor.
 * @remarks Counts enumerate the matching indexed subset, independently of cursor and limit.
 * Only page IDs are hydrated with property/image relations; no dataset-wide feature hydration occurs.
 */
export async function queryFeaturePage(
  db: Database,
  input: FeatureQueryInput,
  authorizedConditions: SQL[],
  hub: HubOptsExtended,
  actorUserId?: string,
): Promise<FeatureQueryPage> {
  const conditions = buildFeatureQueryConditions(db, input, authorizedConditions, hub)
  const limit = input.limit ?? 100
  const source = buildFeatureQuerySource(input)
  const pageConditions = [...conditions]
  if (input.excludeIds?.length)
    pageConditions.push(not(chunkedInArray(feature.id, input.excludeIds)))
  const visitedUserId = input.filters?.list?.userId
  const isVisitedSort =
    input.sorting?.sortBy === 'visitedAt' && visitedUserId !== undefined
  const sortDirection = input.sorting?.sortOrder === 'desc' ? desc : asc
  const compare = input.sorting?.sortOrder === 'desc' ? lt : gt
  const sortValue =
    input.sorting?.sortBy === 'visitedAt' && visitedUserId !== undefined
      ? sql<string>`coalesce((${db
          .select({ value: userFeature.visitedAt })
          .from(userFeature)
          .where(
            and(
              eq(userFeature.userId, visitedUserId),
              eq(userFeature.featureId, feature.id),
            ),
          )
          .limit(1)}), '')`
      : sql<string>`${feature.id}`
  // Visit timestamps sort globally across all pages, with immutable IDs breaking ties.
  if (input.cursor) {
    const cursorCondition = isVisitedSort
      ? or(
          compare(sortValue, input.cursor.value ?? ''),
          and(eq(sortValue, input.cursor.value ?? ''), gt(feature.id, input.cursor.id)),
        )
      : compare(feature.id, input.cursor.id)
    if (cursorCondition) pageConditions.push(cursorCondition)
  }

  // Map discovery skips count work entirely; other views reuse rollups or revision-keyed totals.
  const [ids, counts] = await Promise.all([
    retryBusyRead(() =>
      db
        .select({ id: sql<string>`${feature.id}`, sortValue })
        .from(source)
        .where(and(...pageConditions))
        .orderBy(sortDirection(sortValue), asc(feature.id))
        .limit(limit + 1),
    ),
    input.includeCounts === false
      ? Promise.resolve(null)
      : getFeatureQueryCounts(
          db,
          input,
          conditions,
          source,
          buildFeatureRollupConditions(db, input, authorizedConditions, hub),
        ),
  ])
  const pageIds = ids.slice(0, limit).map(row => row.id)
  const raw = pageIds.length
    ? await retryBusyRead(() =>
        db.query.feature.findMany({
          with: getFeatureWithRelations('list') as never,
          columns: { spatialIndex: false },
          // Recheck visibility if a feature changes between candidate selection and hydration.
          where: and(...conditions, chunkedInArray(feature.id, pageIds)),
          orderBy: asc(feature.id),
        }),
      )
    : []
  const { data } = await toListResponseShape(
    {
      data: raw.sort(
        (left, right) => pageIds.indexOf(left.id) - pageIds.indexOf(right.id),
      ) as unknown as FeatureListDBRaw[],
      totalCount: 0,
    },
    'list',
  )
  // Membership metadata covers this page only and always belongs to the authenticated actor.
  const userFeatures =
    actorUserId && data.length
      ? await retryBusyRead(() =>
          db
            .select()
            .from(userFeature)
            .where(
              and(
                eq(userFeature.userId, actorUserId),
                chunkedInArray(
                  userFeature.featureId,
                  data.map(row => row.id),
                ),
              ),
            ),
        )
      : []
  return {
    data,
    userFeatures,
    totalCount: counts?.totalCount ?? null,
    facets: counts?.facets ?? null,
    nextCursor:
      ids.length > limit
        ? {
            id: pageIds[pageIds.length - 1],
            signature: await featureQuerySignature(input),
            ...(isVisitedSort ? { value: ids[limit - 1].sortValue } : {}),
          }
        : null,
  }
}
// ---
