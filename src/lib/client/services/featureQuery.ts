// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. QUERY IDENTITY
// - canonicalValue
// - featureQueryKey
// - featureQueryScopeKey
// - featureListMembershipKey
//
// 2. CACHED MATCHING
// - matchesFeaturePrisms
// - matchesFeatureQuery
// ---

// H3
import { latLngToCell } from 'h3-js'
// SERVICES
import { getFeaturePointCoordinates } from '$lib/map/featureSpatial'
// TYPES
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'
import type {
  FeatureQueryFilters,
  FeatureQueryInput,
} from '$lib/api/services/featureQuery.types'
import type { FeatureQueryMatchContext } from '$lib/context/featureQuery.types'

/********************
 *  1. QUERY IDENTITY
 ************/
// +++ Query Identity

/**
 * Orders object keys without changing ordered coordinate tuples or cursor values.
 * @param value - JSON-compatible query argument.
 * @returns The same value with a stable object-key order.
 */
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    )
  return value
}

/**
 * Identifies a complete query independently of cursor and already displayed transport IDs.
 * @param input - Search, filters, geographic scope and authorization identity.
 * @returns A stable retained-query key.
 */
export function featureQueryKey(input: FeatureQueryInput): string {
  const { cursor: _cursor, excludeIds: _excludeIds, ...query } = input
  return JSON.stringify(canonicalValue(query))
}

/**
 * Separates public/admin payloads and each authorization, hub and locale scope.
 * @param meta - App-owned complete scope identity; the server authorizes independently.
 * @returns A stable entity-retention scope key.
 */
export function featureQueryScopeKey(meta: FeatureQueryInput['meta']): string {
  return JSON.stringify([meta.isAdminRequest, meta.scope])
}

/**
 * Identifies known membership facts inside an already isolated authorization scope.
 * @param list - User and built-in list selector.
 * @returns A stable membership key.
 */
export function featureListMembershipKey(
  list: NonNullable<FeatureQueryFilters['list']>,
): string {
  return JSON.stringify([list.userId ?? null, list.listId])
}

// ---
/********************
 *  2. CACHED MATCHING
 ************/
// +++ Cached Matching

/**
 * Resolves selected resource IDs using the database's deepest-selected branch union.
 * @param row - Known feature foreign keys.
 * @param prisms - Selected organisation, project and layer identifiers.
 * @param context - Cached parent IDs for selected descendants.
 * @returns Whether a selected branch confidently includes the feature.
 * @remarks A selected child narrows its ancestor branch; unrelated selected branches
 * remain included. Unknown descendant ancestry cannot establish an optimistic match.
 */
export function matchesFeaturePrisms(
  row: FeatureFromCollection,
  prisms: FeatureQueryInput['prisms'],
  context: FeatureQueryMatchContext,
): boolean {
  const layers = prisms?.layer ?? []
  const projects = prisms?.project ?? []
  const organisations = prisms?.organisation ?? []
  if (!layers.length && !projects.length && !organisations.length) return true
  if (layers.includes(row.layerId)) return true
  if (projects.includes(row.projectId))
    return layers.every(layerId => {
      const projectId = context.layerProjectId?.(layerId)
      return projectId !== undefined && projectId !== row.projectId
    })
  if (!organisations.includes(row.organisationId)) return false
  if (
    !projects.every(projectId => {
      const organisationId = context.projectOrganisationId?.(projectId)
      return organisationId !== undefined && organisationId !== row.organisationId
    })
  )
    return false
  return layers.every(layerId => {
    const projectId = context.layerProjectId?.(layerId)
    const organisationId = projectId
      ? context.projectOrganisationId?.(projectId)
      : undefined
    return organisationId !== undefined && organisationId !== row.organisationId
  })
}

/**
 * Matches only facts present in a retained feature and explicitly known local context.
 * @param row - Complete feature collection payload retained in the same scope.
 * @param input - The composed server query being previewed.
 * @param context - Known hierarchy parent IDs and list-membership facts.
 * @returns Whether the cached feature can confidently satisfy this query.
 * @remarks Callers must enforce freshness and scope before using this predicate. Unknown
 * list membership or descendant ancestry never produce optimistic matches.
 */
export function matchesFeatureQuery(
  row: FeatureFromCollection,
  input: FeatureQueryInput,
  context: FeatureQueryMatchContext = {},
): boolean {
  if (!input.meta.isAdminRequest && (!row.isPublished || row.isArchived)) return false

  // The deepest selected IDs narrow their own ancestor branches; other branches form a union.
  const { prisms, filters, spatial } = input
  if (!matchesFeaturePrisms(row, prisms, context)) return false

  // Text search follows the API's literal substring search across translated fields.
  const term = input.q?.trim().replace(/[A-Z]/g, character => character.toLowerCase())
  if (
    term &&
    !Object.values(row.i18n ?? {}).some(translation =>
      ['title', 'description', 'displayAddress'].some(field => {
        const value = translation?.[field as keyof typeof translation]
        return (
          typeof value === 'string' &&
          value.replace(/[A-Z]/g, character => character.toLowerCase()).includes(term)
        )
      }),
    )
  )
    return false

  for (const field of ['isVisitable', 'isIntangible'] as const)
    if (typeof filters?.[field] === 'boolean' && row[field] !== filters[field])
      return false

  if (
    filters?.divisionIds?.length &&
    !row.divisionMemberships?.some(
      member => member.selected && filters.divisionIds!.includes(member.divisionId),
    )
  )
    return false
  if (
    filters?.excludeDivisionIds?.length &&
    row.divisionMemberships?.some(
      member =>
        member.selected && filters.excludeDivisionIds!.includes(member.divisionId),
    )
  )
    return false
  if (filters?.list && context.listMembership?.(row, filters.list) !== true)
    return false

  // Every active property filter must match; layers without their own filters pass.
  for (const [propertyId, filter] of Object.entries(
    filters?.properties?.[row.layerId] ?? {},
  )) {
    if (Array.isArray(filter) && !filter.length) continue
    if (
      typeof filter === 'object' &&
      !Array.isArray(filter) &&
      filter.rangeMin === filter.globalMin &&
      filter.rangeMax === filter.globalMax
    )
      continue
    if (
      !row.properties?.some(property => {
        if (property.propertyId !== propertyId) return false
        if (Array.isArray(filter))
          return Boolean(
            property.propertyValueId && filter.includes(property.propertyValueId),
          )
        if (typeof filter === 'boolean')
          return (filter ? ['true', '1'] : ['false', '0']).includes(
            String(property.value),
          )
        if (
          property.value === null ||
          property.value === undefined ||
          property.value === ''
        )
          return false
        try {
          const value: unknown = JSON.parse(property.value)
          return (
            typeof value === 'number' &&
            Number.isFinite(value) &&
            value >= filter.rangeMin &&
            value <= filter.rangeMax
          )
        } catch {
          return false
        }
      })
    )
      return false
  }

  // Cached point geometry supplies H3 membership without another database request.
  if (spatial) {
    const point = getFeaturePointCoordinates(row.geometry)
    if (!point) return false
    const [longitude, latitude] = point
    if (spatial.bounds) {
      const [west, south, east, north] = spatial.bounds
      if (latitude < south || latitude > north) return false
      if (
        west <= east
          ? longitude < west || longitude > east
          : longitude < west && longitude > east
      )
        return false
    }
    try {
      if (
        !spatial.cells.includes(latLngToCell(latitude, longitude, spatial.resolution))
      )
        return false
    } catch {
      return false
    }
  }
  return true
}

// ---
