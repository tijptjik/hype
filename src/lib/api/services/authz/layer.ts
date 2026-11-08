// DRIZZLE
import { and, eq, or, type SQL } from 'drizzle-orm'
// DB
import { applyPrismConstraints } from '#lib/db/index.js'
import { applyTriStateBooleanCondition } from '#lib/db/query.js'
import { layer } from '#lib/db/schema/index.js'
import { chunkedInArray } from '#lib/utils/batch-query.js'
// API
import { removeExcludedColumns, toTriStateBoolean } from '#lib/api/index.js'
// POLICIES
import { resolveLayerListReadPolicy, isPublicPublishedLayerState } from './layerPolicy'
// ENUMS
import { HierarchicalResource } from '#lib/enums.js'
// TYPES
import type {
  Database,
  Id,
  Prisms,
  QueryParams,
  SessionUser,
  UserRoleDisco,
} from '#lib/types.js'

// Server query adapters retain the existing API; browser consumers use layerPolicy.
export * from './layerPolicy'

const LAYER_VISIBILITY_COLUMNS = ['isArchived', 'isPublished'] as const

/** Restricts inherited query prisms to organisation and project ancestry.
 * @param prisms Requested scope. @returns Normalized ancestry scope, if present.
 */
const toLayerPrisms = (prisms?: Prisms): Prisms | undefined => {
  if (!prisms) return undefined
  return {
    organisation: Array.isArray(prisms.organisation) ? prisms.organisation : [],
    project: Array.isArray(prisms.project) ? prisms.project : [],
    layer: [],
  }
}

export type LayerVisibilityAndOwnershipContext = {
  filtersToApply: QueryParams
  conditions: SQL<unknown>[]
  excludeColumns: string[]
}

/**
 * Builds base SQL conditions enforcing layer visibility and ownership policy.
 * Used by API query composers before generic query filters are applied.
 * @param db Database handle. @param user Current account. @param isAdminRequest Admin request flag.
 * @param params Requested filters. @param userRoles Authoritative role grants.
 * @param prisms Requested ancestry scope. @param resourceHubId Hub boundary.
 * @returns SQL conditions and remaining generic filters.
 */
export const buildLayerVisibilityAndOwnershipConditions = (
  db: Database,
  user: SessionUser,
  isAdminRequest: boolean,
  params: QueryParams,
  userRoles: UserRoleDisco[],
  prisms?: Prisms,
  resourceHubId?: string | null,
): LayerVisibilityAndOwnershipContext => {
  const conditions: SQL<unknown>[] = []
  const excludeColumns = [...LAYER_VISIBILITY_COLUMNS]
  const filteredParams = removeExcludedColumns(params, excludeColumns)

  const layerPrisms = toLayerPrisms(prisms)
  if (layerPrisms) {
    conditions.push(
      ...applyPrismConstraints(db, HierarchicalResource.layer, layerPrisms),
    )
  }

  const requestedIsPublished = toTriStateBoolean(params.isPublished) ?? true
  const requestedIsArchived = toTriStateBoolean(params.isArchived) ?? false

  if (
    !isAdminRequest &&
    isPublicPublishedLayerState({
      isPublished: requestedIsPublished,
      isArchived: requestedIsArchived,
    })
  ) {
    conditions.push(eq(layer.isPublished, true), eq(layer.isArchived, false))
    return { filtersToApply: filteredParams, conditions, excludeColumns }
  }

  const policy = resolveLayerListReadPolicy({
    user: {
      id: user.id,
      isAnonymous: user.isAnonymous,
      superAdmin: user.superAdmin,
    },
    userRoles,
    resourceHubId,
  })
  if (!policy.allowed) {
    conditions.push(eq(layer.id, '__none__' as Id))
    return { filtersToApply: filteredParams, conditions, excludeColumns }
  }

  const hasStrongAccess = policy.isStrong && isAdminRequest

  if (hasStrongAccess) {
    const isPublished = toTriStateBoolean(params.isPublished)
    const isArchived = toTriStateBoolean(params.isArchived)
    applyTriStateBooleanCondition(conditions, layer.isPublished, isPublished)
    applyTriStateBooleanCondition(conditions, layer.isArchived, isArchived)
    return { filtersToApply: filteredParams, conditions, excludeColumns }
  }

  const combineScopeCondition = (
    organisationIds: string[],
    projectIds: string[],
  ): SQL<unknown> | undefined => {
    const scopeConditions: SQL<unknown>[] = []
    if (organisationIds.length > 0) {
      scopeConditions.push(chunkedInArray(layer.organisationId, organisationIds))
    }
    if (projectIds.length > 0) {
      scopeConditions.push(chunkedInArray(layer.projectId, projectIds))
    }
    if (scopeConditions.length === 0) return undefined
    if (scopeConditions.length === 1) return scopeConditions[0]
    return or(...scopeConditions)
  }

  const ownerScopeCondition = combineScopeCondition(
    policy.owner.organisationIds,
    policy.owner.projectIds,
  )
  const maintainerScopeCondition = combineScopeCondition(
    [],
    policy.maintainer.projectIds,
  )
  const publishedOnlyScopeCondition = combineScopeCondition(
    policy.publishedOnly.organisationIds,
    policy.publishedOnly.projectIds,
  )

  const toRoleScopedAccessCondition = (
    scopeCondition: SQL<unknown> | undefined,
    statePolicy:
      | 'all_states'
      | 'include_unpublished_exclude_archived'
      | 'published_only',
    requestedIsPublished: boolean | null | undefined,
    requestedIsArchived: boolean | null | undefined,
  ): SQL<unknown> | undefined => {
    if (!scopeCondition) return undefined

    if (statePolicy === 'published_only') {
      if (requestedIsPublished === false || requestedIsArchived === true)
        return undefined
      const parts: SQL<unknown>[] = [
        scopeCondition,
        eq(layer.isPublished, true),
        eq(layer.isArchived, false),
      ]
      return parts.length === 1 ? parts[0] : and(...parts)
    }

    if (statePolicy === 'include_unpublished_exclude_archived') {
      if (requestedIsArchived === true) return undefined
      const parts: SQL<unknown>[] = [scopeCondition, eq(layer.isArchived, false)]
      if (requestedIsPublished === true) parts.push(eq(layer.isPublished, true))
      if (requestedIsPublished === false) parts.push(eq(layer.isPublished, false))
      return parts.length === 1 ? parts[0] : and(...parts)
    }

    const parts: SQL<unknown>[] = [scopeCondition]
    if (requestedIsPublished === true) parts.push(eq(layer.isPublished, true))
    if (requestedIsPublished === false) parts.push(eq(layer.isPublished, false))
    if (requestedIsArchived === true) parts.push(eq(layer.isArchived, true))
    if (requestedIsArchived === false) parts.push(eq(layer.isArchived, false))
    return parts.length === 1 ? parts[0] : and(...parts)
  }

  const toRoleScopedAccessUnionCondition = (
    requestedIsPublished: boolean | null | undefined,
    requestedIsArchived: boolean | null | undefined,
  ): SQL<unknown> | undefined => {
    const accessBranches: SQL<unknown>[] = []
    const ownerBranch = toRoleScopedAccessCondition(
      ownerScopeCondition,
      'all_states',
      requestedIsPublished,
      requestedIsArchived,
    )
    const maintainerBranch = toRoleScopedAccessCondition(
      maintainerScopeCondition,
      'include_unpublished_exclude_archived',
      requestedIsPublished,
      requestedIsArchived,
    )
    const publishedOnlyBranch = toRoleScopedAccessCondition(
      publishedOnlyScopeCondition,
      'published_only',
      requestedIsPublished,
      requestedIsArchived,
    )

    if (ownerBranch) accessBranches.push(ownerBranch)
    if (maintainerBranch) accessBranches.push(maintainerBranch)
    if (publishedOnlyBranch) accessBranches.push(publishedOnlyBranch)
    if (accessBranches.length === 0) return undefined
    return accessBranches.length === 1 ? accessBranches[0] : or(...accessBranches)
  }

  if (isAdminRequest) {
    const requestedIsPublished = toTriStateBoolean(params.isPublished)
    const requestedIsArchived = toTriStateBoolean(params.isArchived)
    const accessCondition = toRoleScopedAccessUnionCondition(
      requestedIsPublished,
      requestedIsArchived,
    )
    if (!accessCondition) {
      conditions.push(eq(layer.id, '__none__' as Id))
      return { filtersToApply: filteredParams, conditions, excludeColumns }
    }
    conditions.push(accessCondition)
    return { filtersToApply: filteredParams, conditions, excludeColumns }
  }

  const accessCondition = toRoleScopedAccessUnionCondition(
    requestedIsPublished,
    requestedIsArchived,
  )
  if (!accessCondition) {
    conditions.push(eq(layer.id, '__none__' as Id))
    return { filtersToApply: filteredParams, conditions, excludeColumns }
  }
  conditions.push(accessCondition)

  return { filtersToApply: filteredParams, conditions, excludeColumns }
}
