// DRIZZLE
import { asc, eq, inArray, type SQL } from 'drizzle-orm'
// LIB
import {
  applyQueryFilters,
  removeExcludedColumns,
  toStableSignature,
  toTriStateBoolean,
} from '$lib/api'
import { toBooleanOrUndefined } from '$lib/api/services'
// DB
import { transformI18nSafely } from '$lib/db'
import { applyTriStateBooleanCondition } from '$lib/db/query'
import { toImageEnvelope } from '$lib/db/services/image'
import { userColumnsWithPrivacyProtected } from '$lib/db/services/user'
import { isSuperAdmin } from '$lib/client/services/auth'
import {
  OrganisationAdminProfileAPI,
  OrganisationCardProfileAPI,
  OrganisationDetailProfileAPI,
  OrganisationListProfileAPI,
} from '$lib/db/zod'
// SCHEMA
import { organisation, organisationProperty } from '$lib/db/schema/index'
// ENUMS
import { ImageContextResource } from '$lib/enums'
// TYPES
import type {
  CapabilityDefinitions,
  EntityResponse,
  Id,
  ListResponse,
  OrganisationDB,
  QueryParams,
  SessionUser,
  UserRoleDisco,
} from '$lib/types'
import type {
  Organisation,
  OrganisationDBRaw,
  OrganisationEntityByProfile,
  OrganisationListByProfile,
  OrganisationProfile,
} from '$lib/db/zod/schema/organisation.types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// DB RELATIONS
// - organisationWithRelations
// - getOrganisationWithRelations
//
// PROFILE SHAPING
// - toOrganisationProfile
// - toProfileResponseShape
// - toEntityResponseShape
// - toListResponseShape
//
// QUERY CONTEXT
// - toLookupConditions
// - toRequestedListState
// - buildVisibilityAndOwnershipConditions
// - toQueryConditions
//
// CHANGE DETECTION
// - hasOrganisationCapabilitiesChanged

/********************
 *  DB RELATIONS
 ************/
/**
 * Baseline relation graph for lightweight organisation reads.
 * Keeps common list/detail queries cheap while preserving core UI fields.
 */
const organisationWithRelations = {
  i18n: true,
  userRoles: {
    with: {
      user: {
        columns: userColumnsWithPrivacyProtected,
      },
    },
  },
  image: true,
  publisher: {
    columns: userColumnsWithPrivacyProtected,
  },
}

/**
 * Resolves the organisation relation graph for the requested profile.
 * Adds deep property relations for admin profile and hub relation for super admins.
 */
export const getOrganisationWithRelations = (
  profile: OrganisationProfile,
  isSuperAdmin: boolean,
) => {
  if (profile === 'admin') {
    return {
      ...organisationWithRelations,
      properties: {
        with: {
          i18n: true,
          values: {
            with: {
              i18n: true,
            },
          },
        },
      },
      propertyAssignments: {
        orderBy: [asc(organisationProperty.rank)],
        with: {
          property: {
            with: {
              i18n: true,
              values: {
                with: {
                  i18n: true,
                },
              },
            },
          },
        },
      },
      ...(isSuperAdmin ? { hub: true } : {}),
    }
  }

  if (profile === 'card' || profile === 'detail') {
    return {
      i18n: true,
      image: true,
    }
  }

  return {
    i18n: true,
  }
}

/********************
 *  PROFILE SHAPING
 ************/
const organisationProfiles = ['list', 'card', 'detail', 'admin'] as const

/**
 * Normalizes unknown profile input to a supported organisation profile value.
 * Falls back to the provided default when value is invalid or absent.
 */
export const toOrganisationProfile = (
  value: unknown,
  fallback: OrganisationProfile,
): OrganisationProfile =>
  typeof value === 'string' &&
  (organisationProfiles as readonly string[]).includes(value)
    ? (value as OrganisationProfile)
    : fallback

/**
 * Shapes a raw organisation row into a profile-safe API payload.
 * Normalizes i18n blocks and nested property/value structures for stable consumers.
 */
const toProfileResponseShape = async (
  organisation: OrganisationDBRaw,
  profile: OrganisationProfile,
  _isCollection: boolean,
  _isSuperAdmin: boolean,
): Promise<Organisation | Record<string, unknown>> => {
  const orgWithProperties = organisation as OrganisationDBRaw & {
    propertyAssignments?: Array<{
      property?: {
        i18n?: unknown
        values?: Array<{ i18n?: unknown }>
      } | null
    }>
    properties?: Array<{
      i18n?: unknown
      values?: Array<{ i18n?: unknown }>
    }>
  }

  const assignmentProperties = (orgWithProperties.propertyAssignments ?? [])
    .map(assignment => assignment?.property)
    .filter((item: unknown): item is Record<string, unknown> => Boolean(item))
  const rawProperties = (
    assignmentProperties.length > 0
      ? assignmentProperties
      : (orgWithProperties.properties ?? [])
  ) as Array<{
    i18n?: unknown
    values?: Array<{ i18n?: unknown }>
  }>

  const data = {
    ...organisation,
    i18n: transformI18nSafely(organisation.i18n),
    userRoles: organisation.userRoles,
    properties: rawProperties.map(property => ({
      ...property,
      i18n: transformI18nSafely(property.i18n as unknown),
      values: (property.values ?? []).map(value => ({
        ...value,
        i18n: transformI18nSafely(value.i18n as unknown),
      })),
    })),
    image: organisation.image
      ? toImageEnvelope(
          organisation.image,
          profile,
          ImageContextResource.organisation,
          organisation.id,
        )
      : null,
  }

  if (profile === 'list') return OrganisationListProfileAPI.parse(data)
  if (profile === 'card') return OrganisationCardProfileAPI.parse(data)
  if (profile === 'detail') return OrganisationDetailProfileAPI.parse(data)
  return OrganisationAdminProfileAPI.parse(data) as unknown as Organisation
}

/**
 * Shapes a single organisation entity into an API entity response envelope.
 * Returns `data: null` on misses while preserving duration metadata.
 */
export const toEntityResponseShape = async <P extends OrganisationProfile = 'detail'>(
  organisation: OrganisationDBRaw | null,
  user?: SessionUser,
  profile: P = 'detail' as P,
): Promise<EntityResponse<OrganisationEntityByProfile<P>>> => {
  const startedAt = Date.now()

  if (!organisation) {
    return { data: null, durationMs: Date.now() - startedAt }
  }

  const data = await toProfileResponseShape(
    organisation,
    profile,
    false,
    user?.superAdmin || false,
  )
  return {
    data: data as OrganisationEntityByProfile<P>,
    durationMs: Date.now() - startedAt,
  }
}

/**
 * Shapes a paginated organisation result into an API list response envelope.
 * Preserves original pagination/sorting metadata and only transforms row payloads.
 */
export const toListResponseShape = async <P extends OrganisationProfile = 'list'>(
  result: ListResponse<OrganisationDBRaw>,
  user: SessionUser | undefined,
  profile: P = 'list' as P,
): Promise<ListResponse<OrganisationListByProfile<P>>> => {
  const {
    data: organisations,
    limit,
    offset,
    totalCount,
    hasMore,
    nextOffset,
    sortBy,
    sortOrder,
    appliedFilters,
    q,
    durationMs,
  } = result

  const data = await Promise.all(
    organisations.map(organisation =>
      toProfileResponseShape(organisation, profile, true, user?.superAdmin || false),
    ),
  )

  return {
    data: data as Array<OrganisationListByProfile<P>>,
    limit,
    offset,
    totalCount,
    hasMore,
    nextOffset,
    sortBy,
    sortOrder,
    appliedFilters,
    q,
    durationMs,
  }
}

/********************
 *  QUERY CONTEXT
 ************/
/**
 * Builds lookup conditions from route reference params.
 * Supports both `id` and `code` ref modes for shared get/update flows.
 */
export const toLookupConditions = (params: {
  ref: string
  refKey?: 'id' | 'code'
}): Partial<OrganisationDB> =>
  params.refKey === 'code'
    ? ({ code: params.ref } as Partial<OrganisationDB>)
    : ({ id: params.ref as Id } as Partial<OrganisationDB>)

/**
 * Resolves requested visibility state with safe defaults.
 * Defaults align with public list behavior (`published=true`, `archived=false`).
 */
export const toRequestedListState = (conditions: Partial<OrganisationDB>) => ({
  isPublished: toBooleanOrUndefined(conditions.isPublished) ?? true,
  isArchived: toBooleanOrUndefined(conditions.isArchived) ?? false,
})

const VISIBILITY_COLUMNS = ['isArchived', 'isPublished'] as const

/**
 * Builds visibility and ownership constraints for organisation list queries.
 *
 * @param user - Current session user.
 * @param isAdminRequest - Whether request originated from admin context.
 * @param params - Raw query params from list conditions.
 * @param userRoles - Resolved user roles from session.
 * @returns SQL conditions plus params with visibility keys removed.
 * @remarks
 * Tri-state visibility semantics:
 * - `true`: include only records where column is `true`.
 * - `false`: include only records where column is `false`.
 * - `null` or `undefined`: ignore that visibility column.
 *
 * Legacy dot-key and raw filter handling is delegated to `applyQueryFilters`;
 * visibility keys are applied centrally here.
 */
const buildVisibilityAndOwnershipConditions = (
  user: SessionUser,
  isAdminRequest: boolean,
  params: QueryParams,
  userRoles: UserRoleDisco[],
): {
  filtersToApply: QueryParams
  conditions: SQL<unknown>[]
  excludeColumns: string[]
} => {
  const conditions: SQL<unknown>[] = []
  const excludeColumns = [...VISIBILITY_COLUMNS]
  const filteredParams = removeExcludedColumns(params, excludeColumns)

  // Full bypass for super admins and hub admins.
  if (isSuperAdmin(user) || user.isHubAdminForActiveHub) {
    return { filtersToApply: filteredParams, conditions, excludeColumns }
  }

  // Public requests are always strictly published and not archived.
  if (!isAdminRequest) {
    conditions.push(eq(organisation.isPublished, true))
    conditions.push(eq(organisation.isArchived, false))
    return { filtersToApply: filteredParams, conditions, excludeColumns }
  }

  // Admin, non-super/non-hub-admin:
  // Users can query organisations where they have any organisation role.
  const allowedOrganisationIds = userRoles
    .filter(role => role.type === 'organisation')
    .map(role => role.organisationId) as Id[]

  if (allowedOrganisationIds.length === 0) {
    conditions.push(eq(organisation.id, '__none__' as Id))
    return { filtersToApply: filteredParams, conditions, excludeColumns }
  }
  conditions.push(inArray(organisation.id, allowedOrganisationIds))

  // Apply tri-state visibility semantics for admin owner queries.
  const isPublished = toTriStateBoolean(params.isPublished)
  const isArchived = toTriStateBoolean(params.isArchived)

  applyTriStateBooleanCondition(conditions, organisation.isPublished, isPublished)
  applyTriStateBooleanCondition(conditions, organisation.isArchived, isArchived)

  return { filtersToApply: filteredParams, conditions, excludeColumns }
}

/**
 * Builds final organisation query conditions for list/get operations.
 * Combines role-aware visibility constraints with generic request filter application.
 */
export const toQueryConditions = (
  user: SessionUser,
  isAdminRequest: boolean,
  params: QueryParams,
  userRoles: UserRoleDisco[],
): {
  filtersToApply: QueryParams
  conditions: SQL<unknown>[]
  excludeColumns: string[]
} => {
  const contextRespectingVisibilityAndOwnership = buildVisibilityAndOwnershipConditions(
    user,
    isAdminRequest,
    params,
    userRoles,
  )

  // CONTEXT : Apply query filters to the conditions
  if (Object.keys(contextRespectingVisibilityAndOwnership.filtersToApply).length > 0) {
    applyQueryFilters(
      organisation,
      contextRespectingVisibilityAndOwnership.filtersToApply,
      contextRespectingVisibilityAndOwnership.conditions,
    )
  }

  return contextRespectingVisibilityAndOwnership
}

/********************
 *  CHANGE DETECTION
 ************/
/**
 * Determines whether organisation capabilities changed in a submitted update.
 * @param params Submitted/current capability values and field presence.
 * @returns True when capability field was submitted and value differs.
 */
export const hasOrganisationCapabilitiesChanged = (params: {
  hasSubmittedCapabilitiesField: boolean
  submittedCapabilities: CapabilityDefinitions | null | undefined
  currentCapabilities: CapabilityDefinitions | null | undefined
}): boolean =>
  params.hasSubmittedCapabilitiesField &&
  toStableSignature(params.submittedCapabilities ?? {}) !==
    toStableSignature(params.currentCapabilities ?? {})
