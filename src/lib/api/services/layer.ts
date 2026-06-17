// DRIZZLE
import type { SQL } from 'drizzle-orm'
// UTILS
import { nanoid } from 'nanoid'
// API
import { applyQueryFilters } from '$lib/api'
import {
  getDuplicateValues,
  requireValue,
  toBooleanOrUndefined,
} from '$lib/api/services'
import {
  authorizeLayerCreateForSubmission,
  buildLayerVisibilityAndOwnershipConditions,
} from '$lib/api/services/authz/layer'
// DB
import { transformI18nSafely } from '$lib/db'
import { layer } from '$lib/db/schema'
import {
  createI18n,
  createLayer as insertLayer,
  updateProperties,
} from '$lib/db/services/layer'
import { probeProjectForUpdate } from '$lib/db/services/project'
import { userColumnsWithPrivacyProtected } from '$lib/db/services/user'
import {
  LayerAdminProfileAPI,
  LayerCardProfileAPI,
  LayerDetailProfileAPI,
  LayerListProfileAPI,
} from '$lib/db/zod'
// ENUMS
// TYPES
import type {
  Database,
  EntityResponse,
  Id,
  ListResponse,
  Prisms,
  QueryParams,
  SessionUser,
  UserRoleDisco,
} from '$lib/types'
import type {
  Layer,
  LayerDB,
  LayerDBRaw,
  LayerEntityByProfile,
  LayerListByProfile,
  LayerNew,
  LayerProfile,
} from '$lib/db/zod/schema/layer.types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// DB RELATIONS
// - layerCollectionWithRelations
// - layerEntityWithRelations
// - getLayerWithRelations
//
// PROFILE SHAPING
// - toLayerProfile
// - normalizeLayerPropertiesForProfile
// - toProfileResponseShape
// - toEntityResponseShape
// - toListResponseShape
//
// NORMALIZATION
// - toComparableLayerProperties
// - toLayerPrisms
//
// COMMANDS
// - createLayerFromSubmission
//
// QUERY CONTEXT
// - toLookupConditions
// - toRequestedListState
// - toQueryConditions

/********************
 *  DB RELATIONS
 ************/
/**
 * Lightweight relation graph for non-admin layer reads.
 * Keeps list/detail payloads small while preserving the fields the UI expects.
 */
const layerCollectionWithRelations = {
  i18n: true,
  properties: true,
}

/**
 * Full relation graph for admin or write-oriented layer reads.
 * Includes nested property definitions and publisher attribution for admin workflows.
 */
export const layerEntityWithRelations = {
  i18n: true,
  properties: {
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
  publisher: {
    columns: userColumnsWithPrivacyProtected,
  },
}

/**
 * Returns relation hydration settings for the selected layer profile.
 * Fetches only the relation graph required by the requested response and admin visibility state.
 *
 * @param profile - Requested response profile.
 * @param isAdminUser - Whether publisher fields may be exposed in non-admin detail/card views.
 * @returns Relation shape suitable for Drizzle `with` clauses.
 */
export const getLayerWithRelations = (
  profile: LayerProfile,
  isAdminUser: boolean,
): Record<string, boolean | object> => {
  if (profile === 'admin') return layerEntityWithRelations

  if (profile === 'detail' || profile === 'card') {
    return {
      i18n: true,
      properties: true,
      ...(isAdminUser
        ? {
            publisher: {
              columns: userColumnsWithPrivacyProtected,
            },
          }
        : {}),
    }
  }

  return layerCollectionWithRelations
}

/********************
 *  PROFILE SHAPING
 ************/
const layerProfiles = ['list', 'card', 'detail', 'admin'] as const

/**
 * Normalizes arbitrary profile input into a supported layer profile.
 * Prevents invalid profile selectors from leaking into query and response branches.
 *
 * @param value - Raw caller-supplied profile value.
 * @param fallback - Profile returned when `value` is missing or invalid.
 * @returns Safe layer profile.
 */
export const toLayerProfile = (value: unknown, fallback: LayerProfile): LayerProfile =>
  typeof value === 'string' && (layerProfiles as readonly string[]).includes(value)
    ? (value as LayerProfile)
    : fallback

/**
 * Normalizes nested layer property relation payloads for response schemas.
 * Converts nested i18n arrays into the locale-map shape expected by layer API responses.
 *
 * @param properties - Raw nested layer property relation payload.
 * @returns Layer properties with transformed i18n and value payloads.
 */
const normalizeLayerPropertiesForProfile = (
  properties: LayerDBRaw['properties'] | null | undefined,
): LayerDBRaw['properties'] => {
  if (!Array.isArray(properties)) return []

  const normalized = properties.map(propertyRow => {
    const propertyDef =
      propertyRow && typeof propertyRow === 'object' ? propertyRow.property : null

    if (!propertyDef || typeof propertyDef !== 'object') return propertyRow

    const normalizedValues = Array.isArray(propertyDef.values)
      ? propertyDef.values.map(value => ({
          ...value,
          i18n: transformI18nSafely(value?.i18n as never),
        }))
      : propertyDef.values

    return {
      ...propertyRow,
      property: {
        ...propertyDef,
        i18n: transformI18nSafely(propertyDef.i18n as never),
        values: normalizedValues,
      },
    }
  }) as NonNullable<LayerDBRaw['properties']>

  type NormalizedLayerProperty = NonNullable<LayerDBRaw['properties']>[number]
  const deduped = new Map<string, NormalizedLayerProperty>()
  for (const propertyRow of normalized) {
    const propertyId =
      typeof propertyRow?.propertyId === 'string'
        ? propertyRow.propertyId
        : propertyRow?.property?.id
    if (!propertyId || deduped.has(propertyId)) continue
    deduped.set(propertyId, propertyRow)
  }

  return Array.from(deduped.values()) as LayerDBRaw['properties']
}

/**
 * Shapes a hydrated layer row into a profile-specific API payload.
 * Keeps schema branching centralized so entity and list responses share one path.
 *
 * @param row - Hydrated layer row.
 * @param profile - Target response profile.
 * @returns Parsed profile-specific layer payload.
 */
const toProfileResponseShape = async (
  row: LayerDBRaw,
  profile: LayerProfile,
): Promise<Layer> => {
  const data = {
    ...row,
    i18n: transformI18nSafely(row.i18n),
    properties: normalizeLayerPropertiesForProfile(row.properties),
  }

  if (profile === 'list') return LayerListProfileAPI.parse(data) as Layer
  if (profile === 'card') return LayerCardProfileAPI.parse(data) as Layer
  if (profile === 'detail') return LayerDetailProfileAPI.parse(data) as Layer
  return LayerAdminProfileAPI.parse(data) as Layer
}

/**
 * Shapes a single layer entity into an API entity response envelope.
 * Returns `data: null` on misses while preserving duration metadata.
 *
 * @param row - Layer row or `null`.
 * @param profile - Output response profile.
 * @returns Entity response envelope with typed layer payload.
 */
export const toEntityResponseShape = async <P extends LayerProfile = 'detail'>(
  row: LayerDBRaw | null,
  profile: P = 'detail' as P,
): Promise<EntityResponse<LayerEntityByProfile<P>>> => {
  const startedAt = Date.now()

  if (!row) {
    return {
      data: null as unknown as LayerEntityByProfile<P>,
      durationMs: Date.now() - startedAt,
    }
  }

  const data = await toProfileResponseShape(row, profile)
  return {
    data: data as LayerEntityByProfile<P>,
    durationMs: Date.now() - startedAt,
  }
}

/**
 * Shapes a paginated layer result into an API list response envelope.
 * Ensures every row is normalized through the same profile-specific response path.
 *
 * @param result - Paginated layer rows from the DB layer.
 * @param profile - Output response profile.
 * @returns List response envelope with typed layer payloads.
 */
export const toListResponseShape = async <P extends LayerProfile = 'list'>(
  result: ListResponse<LayerDBRaw>,
  profile: P = 'list' as P,
): Promise<ListResponse<LayerListByProfile<P>>> => {
  const {
    data: rows,
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

  const data = await Promise.all(rows.map(row => toProfileResponseShape(row, profile)))

  return {
    data: data as LayerListByProfile<P>[],
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
 *  NORMALIZATION
 ************/
/**
 * Projects layer property assignments into a comparable, order-stable array.
 * Used by remote commands to detect semantic property changes independent of payload order.
 *
 * @param properties - Unknown submitted or persisted property-assignment payload.
 * @returns Comparable property tuples sorted by `propertyId`.
 */
export const toComparableLayerProperties = (
  properties: unknown,
): Array<{
  propertyId: string
  isVisible: boolean
  isUserContributable: boolean
}> => {
  if (!Array.isArray(properties)) return []

  return properties
    .filter(
      (
        property,
      ): property is {
        propertyId: string
        isVisible?: boolean
        isUserContributable?: boolean
      } =>
        Boolean(property) &&
        typeof property === 'object' &&
        typeof (property as { propertyId?: unknown }).propertyId === 'string',
    )
    .map(property => ({
      propertyId: property.propertyId,
      isVisible: Boolean(property.isVisible),
      isUserContributable: Boolean(property.isUserContributable),
    }))
    .sort((left, right) => left.propertyId.localeCompare(right.propertyId))
}

/**
 * Normalizes optional layer prism payload into a complete prism object.
 * Remote handlers use this to avoid branching on partially-defined prism arrays.
 *
 * @param prisms - Optional raw prism payload.
 * @returns Prism object with concrete arrays for every hierarchy level.
 */
export const toLayerPrisms = (prisms?: Prisms): Prisms => ({
  organisation: Array.isArray(prisms?.organisation) ? prisms.organisation : [],
  project: Array.isArray(prisms?.project) ? prisms.project : [],
  layer: Array.isArray(prisms?.layer) ? prisms.layer : [],
})

/********************
 *  COMMANDS
 ************/
type LayerSubmittedProperty = {
  propertyId: string
  isVisible?: boolean
  isUserContributable?: boolean
}

type LayerCreateFailureHandler = (message: string) => never

type CreateLayerFromSubmissionParams = {
  db: Database
  user: SessionUser
  userRoles: UserRoleDisco[]
  submittedData: LayerNew
  submittedProperties: LayerSubmittedProperty[]
  onInvalid: LayerCreateFailureHandler
  onNotFound?: LayerCreateFailureHandler
  onForbidden?: LayerCreateFailureHandler
  onInvalidProperties?: LayerCreateFailureHandler
}

/**
 * Creates a layer from normalized submission data shared by form and command remotes.
 * Validates duplicate property assignments, resolves project scope, checks authz, and
 * persists the layer, i18n rows, and property assignments in one path.
 *
 * @param params - Shared create context and normalized layer submission payload.
 * @param params.db - Database handle used for scope lookup and persistence.
 * @param params.user - Current session user.
 * @param params.userRoles - Current user's resolved role rows.
 * @param params.submittedData - Parsed layer create payload.
 * @param params.submittedProperties - Normalized property assignments for the layer.
 * @param params.onInvalid - Failure handler for generic validation or authz issues.
 * @param params.onNotFound - Optional handler for missing project scope.
 * @param params.onForbidden - Optional handler for authorization failures.
 * @param params.onInvalidProperties - Optional property-field-specific failure handler.
 * @returns Persisted layer row containing the created id and timestamps.
 * @remarks
 * Callers provide the failure handlers so remote forms can surface field-aware validation
 * issues while command remotes can translate the same failures into HTTP errors.
 */
export const createLayerFromSubmission = async ({
  db,
  user,
  userRoles,
  submittedData,
  submittedProperties,
  onInvalid,
  onNotFound,
  onForbidden,
  onInvalidProperties,
}: CreateLayerFromSubmissionParams): Promise<LayerDB> => {
  const invalidProperties = onInvalidProperties ?? onInvalid
  const notFound = onNotFound ?? onInvalid
  const forbidden = onForbidden ?? onInvalid

  const duplicateSubmittedPropertyIds = getDuplicateValues(
    submittedProperties
      .map(property => property?.propertyId)
      .filter(
        (propertyId): propertyId is string =>
          typeof propertyId === 'string' && propertyId.trim().length > 0,
      ),
  )

  if (duplicateSubmittedPropertyIds.length > 0) {
    invalidProperties(
      `INVALID: Duplicate properties submitted (${Array.from(new Set(duplicateSubmittedPropertyIds)).join(', ')})`,
    )
  }

  const projectScope = requireValue(
    await probeProjectForUpdate(db, submittedData.projectId as Id),
    () => notFound('PROJECT_NOT_FOUND'),
  )

  // Evaluate create permissions against the resolved project scope before persistence.
  const createDecision = authorizeLayerCreateForSubmission({
    user,
    userRoles,
    resource: {
      organisationId: projectScope.organisationId,
      projectId: submittedData.projectId,
      hubId: projectScope.hubId,
    },
    submittedData,
  })
  if (!createDecision.allowed) {
    forbidden(createDecision.code ?? 'INSUFFICIENT_ROLE')
  }

  const created = await insertLayer(db, {
    id: nanoid(12),
    organisationId: projectScope.organisationId,
    projectId: submittedData.projectId,
    metadata: submittedData.metadata,
    isDefaultVisible: submittedData.isDefaultVisible,
    isPublished: false,
    isArchived: false,
  })
  await createI18n(db, submittedData.i18n, created.id)
  await updateProperties(db, created.id, submittedProperties)

  return created
}

/********************
 *  QUERY CONTEXT
 ************/
/**
 * Resolves entity lookup conditions from route reference params.
 * Layer reads are id-scoped, so this helper always emits an `id` lookup.
 *
 * @param params - Route reference params.
 * @returns Partial layer lookup object suitable for query param validation.
 */
export const toLookupConditions = (params: {
  ref: string
  refKey?: 'id'
}): Partial<LayerDB> => ({ id: params.ref as Id }) as Partial<LayerDB>

/**
 * Resolves default list visibility flags for layer queries.
 * Public callers default to published and non-archived records unless they ask otherwise.
 *
 * @param params - Partial layer filter state.
 * @returns Normalized requested visibility flags.
 */
export const toRequestedListState = (params: Partial<LayerDB>) => ({
  isPublished: toBooleanOrUndefined(params.isPublished) ?? true,
  isArchived: toBooleanOrUndefined(params.isArchived) ?? false,
})

/**
 * Produces final layer query conditions with policy-derived visibility scoping and generic filters.
 * Remote handlers rely on this after authorization has already been evaluated at the policy layer.
 *
 * @param db - Database handle.
 * @param user - Current session user.
 * @param isAdminRequest - Whether the request originated from an admin context.
 * @param params - Validated query params.
 * @param userRoles - Resolved session role rows.
 * @param prisms - Optional prism filters.
 * @param resourceHubId - Optional hub scope for the queried resource.
 * @returns Query context containing SQL conditions, filter payload, and excluded columns.
 */
export const toQueryConditions = (
  db: Database,
  user: SessionUser,
  isAdminRequest: boolean,
  params: QueryParams,
  userRoles: UserRoleDisco[],
  prisms?: Prisms,
  resourceHubId?: string | null,
): {
  filtersToApply: QueryParams
  conditions: SQL<unknown>[]
  excludeColumns: string[]
} => {
  const context = buildLayerVisibilityAndOwnershipConditions(
    db,
    user,
    isAdminRequest,
    params,
    userRoles,
    prisms,
    resourceHubId,
  )

  if (Object.keys(context.filtersToApply).length > 0) {
    applyQueryFilters(layer, context.filtersToApply, context.conditions)
  }

  return context
}
