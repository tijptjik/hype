// DRIZZLE
import type { SQL } from 'drizzle-orm'
import { applyQueryFilters } from '$lib/api'
import { toBooleanOrUndefined } from '$lib/api/services'
import { buildLayerVisibilityAndOwnershipConditions } from '$lib/api/services/authz/layer'
// AUTH
import {
  assertAdminRequest,
  assertParamIdentifierEqualsFormIdentifier,
  assertProjectMaintainerOrSuperAdmin,
  assertUserLoggedIn,
  runAssertions,
} from '$lib/auth/asserts'
// DB
import { transformI18nSafely } from '$lib/db'
import { toImageEnvelope } from '$lib/db/services/image'
import { userColumnsWithPrivacyProtected } from '$lib/db/services/user'
import {
  LayerAdminProfileAPI,
  LayerCardProfileAPI,
  LayerDetailProfileAPI,
  LayerListProfileAPI,
} from '$lib/db/zod'
// ENUMS
import { ImageContextResource } from '$lib/enums'
import { layer } from '$lib/db/schema'
// TYPES
import type {
  Layer,
  LayerDB,
  LayerDBNew,
  LayerDBRaw,
  LayerEntityByProfile,
  LayerI18nDB,
  LayerListByProfile,
  LayerPropertyDBRaw,
  LayerProfile,
  Database,
  EntityResponse,
  Id,
  ListResponse,
  Prisms,
  QueryParams,
  SessionUser,
  UserRoleDisco,
} from '$lib/types'

export const layerCollectionWithRelations = {
  i18n: true,
  properties: true,
}

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

const layerProfiles = ['list', 'card', 'detail', 'admin'] as const

/**
 * Normalizes arbitrary profile input into a supported layer profile.
 * Used to prevent invalid profile selectors from leaking into query/response logic.
 */
export const toLayerProfile = (value: unknown, fallback: LayerProfile): LayerProfile =>
  typeof value === 'string' && (layerProfiles as readonly string[]).includes(value)
    ? (value as LayerProfile)
    : fallback

/**
 * Projects layer property assignments into a comparable, order-stable array.
 * Used by remote commands to detect semantic changes independent of payload order/noise.
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
 * Shapes a layer row into an admin response payload.
 *
 * @param row - Base layer row.
 * @param i18n - Optional layer i18n rows.
 * @param properties - Optional layer property rows.
 * @returns Parsed admin layer payload.
 */
export const toResponseShape = async (
  row: LayerDBRaw,
  i18n: LayerI18nDB[] = [],
  properties: LayerPropertyDBRaw[] = [],
) => {
  const data = {
    ...row,
    i18n: transformI18nSafely(i18n.length > 0 ? i18n : row.i18n, {}),
    properties: normalizeLayerPropertiesForProfile(
      properties.length > 0 ? (properties as never) : row.properties,
    ),
  }
  return LayerAdminProfileAPI.parse(data)
}

/**
 * Shapes a single layer entity into an API entity response envelope.
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
    return { data: null as LayerEntityByProfile<P>, durationMs: Date.now() - startedAt }
  }

  const data = await toProfileResponseShape(row, profile)
  return {
    data: data as LayerEntityByProfile<P>,
    durationMs: Date.now() - startedAt,
  }
}

/**
 * Shapes a paginated layer result into an API list response envelope.
 *
 * @param result - Paginated layer rows from DB service.
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

/**
 * Normalizes nested layer property relation payloads for response schemas.
 * Used to ensure property/value i18n blocks are in transformed locale-map format.
 */
const normalizeLayerPropertiesForProfile = (
  properties: LayerDBRaw['properties'] | null | undefined,
): LayerDBRaw['properties'] => {
  if (!Array.isArray(properties)) return []

  return properties.map(propertyRow => {
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
  }) as LayerDBRaw['properties']
}

/**
 * Shapes a hydrated layer row to a profile-specific API payload.
 * Used by entity/list shapers to keep profile branching in one place.
 */
const toProfileResponseShape = async (
  row: LayerDBRaw,
  profile: LayerProfile,
): Promise<Layer> => {
  const data = {
    ...row,
    i18n: transformI18nSafely(row.i18n),
    properties: normalizeLayerPropertiesForProfile(row.properties),
    image: row.image
      ? toImageEnvelope(row.image as never, 'card', ImageContextResource.layer, row.id)
      : null,
  }

  if (profile === 'list') return LayerListProfileAPI.parse(data) as Layer
  if (profile === 'card') return LayerCardProfileAPI.parse(data) as Layer
  if (profile === 'detail') return LayerDetailProfileAPI.parse(data) as Layer
  return LayerAdminProfileAPI.parse(data) as Layer
}

/**
 * Returns relation hydration settings for the selected layer profile.
 * Used to fetch only the relation graph required by each response shape.
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

/**
 * Resolves entity lookup conditions from route reference params.
 * Used by read/update flows that fetch layers by id.
 */
export const toLookupConditions = (params: {
  ref: string
  refKey?: 'id'
}): Partial<LayerDB> => ({ id: params.ref as Id }) as Partial<LayerDB>

/**
 * Resolves default list visibility flags for layer queries.
 * Used to enforce safe defaults when callers omit explicit filters.
 */
export const toRequestedListState = (params: Partial<LayerDB>) => ({
  isPublished: toBooleanOrUndefined(params.isPublished) ?? true,
  isArchived: toBooleanOrUndefined(params.isArchived) ?? false,
})

/**
 * Normalizes optional layer prism payload into a complete prism object.
 * Used by remote handlers so query composition always receives concrete arrays.
 */
export const toLayerPrisms = (prisms?: Prisms): Prisms => ({
  organisation: Array.isArray(prisms?.organisation) ? prisms.organisation : [],
  project: Array.isArray(prisms?.project) ? prisms.project : [],
  layer: Array.isArray(prisms?.layer) ? prisms.layer : [],
})

/**
 * Produces final layer query conditions with policy + filter composition.
 * Used by remote list handlers to keep filtering and authz behavior centralized.
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

// Legacy assertions still used by REST handlers.
/**
 * Asserts access requirements for layer creation in legacy handlers.
 * Used to preserve existing REST behavior while remote-form migration is in progress.
 */
export const assertPermissionsToCreateLayer = (
  user: SessionUser,
  request: Request,
  formData: LayerDBNew,
  userRoles: UserRoleDisco[],
) => {
  const assertionError = runAssertions(
    () => assertUserLoggedIn(user as never),
    () => assertAdminRequest(request),
    () => assertProjectMaintainerOrSuperAdmin(user, userRoles, formData.projectId),
  )

  if (assertionError) return assertionError
}

/**
 * Asserts access requirements for layer updates in legacy handlers.
 * Used to keep identifier + role checks consistent across update paths.
 */
export const assertPermissionsToUpdateLayer = (
  user: SessionUser,
  request: Request,
  formData: LayerDB,
  userRoles: UserRoleDisco[],
  refId: Id,
) => {
  const assertionError = runAssertions(
    () => assertUserLoggedIn(user as never),
    () => assertAdminRequest(request),
    () => assertParamIdentifierEqualsFormIdentifier(formData, refId, 'id'),
    () => assertProjectMaintainerOrSuperAdmin(user, userRoles, formData.projectId),
  )

  if (assertionError) return assertionError
}
