// DRIZZLE
import { inArray, type SQL } from 'drizzle-orm'
// API
import { applyQueryFilters } from '..'
// DB
import { transformI18nSafely } from '$lib/db'
// SCHEMA
import { property, project as projectTable } from '$lib/db/schema/index'
// ZOD
import { PropertyDetailProfileAPI } from '$lib/db/zod'
// TYPES
import type {
  Database,
  Prisms,
  QueryParams,
  SessionUser,
  UserRoleDisco,
} from '$lib/types'
import type { Property, PropertyDBRaw } from '$lib/db/zod/schema/property.types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// DB RELATIONS
// - propertyCollectionWithRelations
//
// PROFILE SHAPING
// - toPropertyResponseShape
// - toPropertyResponseFromRaw
//
// QUERY CONTEXT
// - toPropertyPrismConditions
// - getPropertyQueryContext

/********************
 *  DB RELATIONS
 ************/
/**
 * Baseline relation graph for property list/detail reads.
 * Loads property i18n and nested value i18n because both are required to render
 * stable property payloads across admin and public consumers.
 */
export const propertyCollectionWithRelations = {
  i18n: true,
  values: {
    with: {
      i18n: true,
    },
  },
}

/********************
 *  PROFILE SHAPING
 ************/
/**
 * Builds the canonical property API payload from one raw property row.
 * Used by remotes that do not need to override rank ordering.
 *
 * @param row - Property row with optional nested i18n and values.
 * @returns Schema-validated property payload in the default response shape.
 */
export const toPropertyResponseShape = (row: PropertyDBRaw): Property =>
  toPropertyResponseFromRaw(row)

/**
 * Shapes a raw property row into API wire format with optional rank override.
 * Centralizes i18n normalization so DB services, remotes, and assignment-based
 * readers all share one stable property payload contract.
 *
 * @param row - Raw property row with nested i18n/value relations.
 * @param rankOverride - Optional rank override for assignment-ordered responses.
 * @returns Schema-validated property payload with normalized locale maps.
 */
export const toPropertyResponseFromRaw = (
  row: PropertyDBRaw,
  rankOverride?: number,
): Property => {
  const values = (row.values ?? []).map(value => ({
    ...value,
    i18n: transformI18nSafely(value.i18n),
  }))

  return PropertyDetailProfileAPI.parse({
    ...row,
    rank: typeof rankOverride === 'number' ? rankOverride : 0,
    i18n: transformI18nSafely(row.i18n),
    values,
  })
}

/********************
 *  QUERY CONTEXT
 ************/
/**
 * Expands prism filters into property-scoped SQL conditions.
 * Project prisms apply directly; organisation prisms are translated through the
 * project table first because properties are ultimately owned by projects.
 *
 * @param params - Database handle, prism state, and optional existing conditions.
 * @returns Condition array augmented with prism-derived scope constraints.
 */
export const toPropertyPrismConditions = async (params: {
  db: Database
  prisms: Prisms
  conditions?: SQL<unknown>[]
}): Promise<SQL<unknown>[]> => {
  const scopedConditions = [...(params.conditions ?? [])]

  if (params.prisms.project.length > 0) {
    scopedConditions.push(inArray(property.projectId, params.prisms.project))
    return scopedConditions
  }

  if (params.prisms.organisation.length > 0) {
    const projectsInOrgs = await params.db.query.project.findMany({
      where: inArray(projectTable.organisationId, params.prisms.organisation),
      columns: { id: true },
    })
    const projectIds = projectsInOrgs.map(project => project.id)
    if (projectIds.length > 0) {
      scopedConditions.push(inArray(property.projectId, projectIds))
    }
  }

  return scopedConditions
}

/**
 * Builds final property query context from incoming filter params.
 * Property reads are currently policy-neutral, so this helper only centralizes
 * generic query-filter application and preserves contract parity with other services.
 *
 * @param _user - Current session user, retained for contract parity with other services.
 * @param _request - Request object, retained for contract parity with other services.
 * @param params - Raw query parameters to convert into SQL conditions.
 * @param _userRoles - Resolved user roles, retained for future policy-aware filtering.
 * @returns Query params plus derived SQL conditions and excluded-column metadata.
 */
export const getPropertyQueryContext = (
  _user: SessionUser,
  _request: Request,
  params: QueryParams,
  _userRoles: UserRoleDisco[],
): {
  params: QueryParams
  conditions: SQL<unknown>[]
  excludeColumns: string[]
} => {
  const conditions: SQL<unknown>[] = []
  const excludeColumns: string[] = []

  if (Object.keys(params).length > 0) {
    applyQueryFilters(property, params, conditions)
  }

  return { params, conditions, excludeColumns }
}
