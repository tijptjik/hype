import { and, eq, inArray, or, type SQL } from 'drizzle-orm'
import { error } from '@sveltejs/kit'
import { removeExcludedColumns, toTriStateBoolean } from '$lib/api'
import { shouldLogAuthzDeny, toActorPolicyBase, toAuthMessage } from '.'
import { isCoreHubAdmin, isRelevantHubAdmin } from './hub'
import { applyPrismConstraints } from '$lib/db'
import { applyTriStateBooleanCondition } from '$lib/db/query'
import { layer } from '$lib/db/schema'
import { HierarchicalResource } from '$lib/enums'
import type {
  AuthorizationDecision,
  Database,
  Id,
  Prisms,
  QueryParams,
  SessionUser,
  UserRoleDisco,
} from '$lib/types'

type LayerPolicyCode = 'UNAUTHENTICATED' | 'INSUFFICIENT_ROLE' | 'FIELD_FORBIDDEN'

export type LayerVisibilityPolicy =
  | 'all_states'
  | 'include_unpublished_exclude_archived'
  | 'published_only'

export type LayerReadStatePolicy =
  | 'all'
  | 'nonArchivedAnyPublish'
  | 'publishedNonArchived'

const LAYER_AUTHZ_DENY_LOG_SCOPE = '[authz][layer][deny]'

export type LayerAuthActor = {
  userId?: string | null
  userRoles: UserRoleDisco[]
  isAuthenticated?: boolean
  isAnonymous?: boolean
  isSuperAdmin?: boolean
}

export type LayerAuthTarget = {
  id?: string
  organisationId?: string | null
  projectId?: string | null
  hubId?: string | null
}

export type LayerSubmittedData = Partial<{
  code: string
  i18n: unknown
  properties: unknown
  isDefaultVisible: boolean
  metadata: unknown
  organisationId: string
  projectId: string
}>

type LayerRequestedState = {
  isPublished?: boolean
  isArchived?: boolean
}

export type LayerListReadScope = {
  allowed: boolean
  code?: LayerPolicyCode
  isStrong: boolean
  visibilityPolicy: LayerVisibilityPolicy
  allowedOrganisationIds: string[]
  allowedProjectIds: string[]
  ownerOrganisationIds: string[]
  ownerProjectIds: string[]
  maintainerProjectIds: string[]
  publishedOnlyOrganisationIds: string[]
  publishedOnlyProjectIds: string[]
  canSeeUnpublishedInAnyScope: boolean
  canSeeArchivedInAnyScope: boolean
}

export type LayerRoleScopeBucket = {
  statePolicy: LayerReadStatePolicy
  organisationIds: string[]
  projectIds: string[]
}

export type LayerListReadPolicy = {
  allowed: boolean
  code?: LayerPolicyCode
  isStrong: boolean
  owner: LayerRoleScopeBucket
  maintainer: LayerRoleScopeBucket
  publishedOnly: LayerRoleScopeBucket
}

export type LayerProjectSelectionScope = {
  canCreate: boolean
  allowAll: boolean
  allowedHubIds: string[]
  allowedOrganisationIds: string[]
  allowedProjectIds: string[]
}

const LAYER_VISIBILITY_COLUMNS = ['isArchived', 'isPublished'] as const

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
 * Emits structured deny diagnostics and returns a standard deny decision.
 * Used to keep rejection handling uniform across layer authz entry points.
 */
const logLayerReject = (
  scope: string,
  code: LayerPolicyCode,
  params: {
    actor: LayerAuthActor
    target?: LayerAuthTarget
    fields?: string[]
    requestedState?: LayerRequestedState
  },
  extra: Record<string, unknown> = {},
): AuthorizationDecision => {
  if (shouldLogAuthzDeny()) {
    console.log(`${LAYER_AUTHZ_DENY_LOG_SCOPE}[${scope}]`, {
      code,
      userId: params.actor.userId ?? null,
      isAuthenticated: params.actor.isAuthenticated ?? null,
      isAnonymous: params.actor.isAnonymous ?? null,
      isSuperAdmin: params.actor.isSuperAdmin ?? false,
      userRoleCount: params.actor.userRoles.length,
      target: params.target ?? null,
      fields: params.fields ?? null,
      requestedState: params.requestedState ?? null,
      ...extra,
    })
  }

  return { allowed: false, code }
}

/**
 * Checks whether the actor owns the target organisation.
 * Used for privileged layer create/update/publish permissions.
 */
const hasOrganisationOwnerRole = (
  roles: UserRoleDisco[],
  organisationId?: string | null,
): boolean =>
  Boolean(organisationId) &&
  roles.some(
    role =>
      role.type === 'organisation' &&
      role.organisationId === organisationId &&
      role.role === 'owner',
  )

/**
 * Checks whether the actor owns the target project.
 * Used for project-scoped layer management permissions.
 */
const hasProjectOwnerRole = (
  roles: UserRoleDisco[],
  projectId?: string | null,
): boolean =>
  Boolean(projectId) &&
  roles.some(
    role =>
      role.type === 'project' && role.projectId === projectId && role.role === 'owner',
  )

/**
 * Checks if the actor has project-level i18n editing capability.
 * Used to allow translation-only edits without full maintainer permissions.
 */
const hasProjectI18nEditorRole = (
  roles: UserRoleDisco[],
  projectId?: string | null,
): boolean =>
  Boolean(projectId) &&
  roles.some(
    role =>
      role.type === 'project' &&
      role.projectId === projectId &&
      (role.role === 'owner' ||
        role.role === 'maintainer' ||
        role.role === 'translator'),
  )

/**
 * Verifies the actor represents an authenticated non-anonymous session.
 * Used as the baseline gate for all mutating layer authz decisions.
 */
const hasAuthenticatedSession = (actor: LayerAuthActor): boolean =>
  Boolean(actor.isAuthenticated && actor.userId && !actor.isAnonymous)

/**
 * Normalizes incoming user/session data into the layer auth actor model.
 * Used to ensure all policy resolvers consume a consistent actor shape.
 */
export const toLayerAuthActor = (user: {
  id?: string | null
  isAnonymous?: boolean | null
  superAdmin?: boolean | null
  roles?: UserRoleDisco[]
}): LayerAuthActor => {
  const userRoles = Array.isArray(user.roles) ? user.roles : []

  return {
    userId: user.id ?? null,
    userRoles,
    isAnonymous: user.isAnonymous === true,
    isAuthenticated: Boolean(user.id) && user.isAnonymous !== true,
    isSuperAdmin: (user.superAdmin === true || isCoreHubAdmin(userRoles)) ?? false,
  }
}

/**
 * Projects actor data to the shared authz base fields.
 * Used when downstream resolvers only need core actor attributes.
 */
const toLayerPolicyBase = (
  actor: LayerAuthActor,
): Pick<
  LayerAuthActor,
  'userId' | 'userRoles' | 'isAuthenticated' | 'isAnonymous' | 'isSuperAdmin'
> => toActorPolicyBase(actor)

/**
 * Deduplicates and sanitizes id arrays by removing null/empty values.
 * Used to build deterministic scope sets for policy computation.
 */
const toUniqueIds = (ids: Array<string | null | undefined>): string[] =>
  Array.from(
    new Set(
      ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
    ),
  )

/**
 * Resolves high-level layer list scope metadata from policy buckets.
 * Used by query builders to derive allowed org/project filters and visibility modes.
 */
export const resolveLayerListReadScope = (params: {
  user: {
    id?: string | null
    isAnonymous?: boolean | null
    superAdmin?: boolean | null
  }
  userRoles: UserRoleDisco[]
  resourceHubId?: string | null
}): LayerListReadScope => {
  const policy = resolveLayerListReadPolicy(params)
  const ownerOrganisationIds = policy.owner.organisationIds
  const ownerProjectIds = policy.owner.projectIds
  const maintainerProjectIds = policy.maintainer.projectIds
  const publishedOnlyOrganisationIds = policy.publishedOnly.organisationIds
  const publishedOnlyProjectIds = policy.publishedOnly.projectIds
  const allowedOrganisationIds = toUniqueIds([
    ...ownerOrganisationIds,
    ...publishedOnlyOrganisationIds,
  ])
  const allowedProjectIds = toUniqueIds([
    ...ownerProjectIds,
    ...maintainerProjectIds,
    ...publishedOnlyProjectIds,
  ])
  const hasOwnerScope = ownerOrganisationIds.length > 0 || ownerProjectIds.length > 0
  const hasMaintainerScope = maintainerProjectIds.length > 0
  const visibilityPolicy: LayerVisibilityPolicy = policy.isStrong
    ? 'all_states'
    : hasOwnerScope
      ? 'all_states'
      : hasMaintainerScope
        ? 'include_unpublished_exclude_archived'
        : 'published_only'

  return {
    allowed: policy.allowed,
    code: policy.code,
    isStrong: policy.isStrong,
    visibilityPolicy,
    allowedOrganisationIds,
    allowedProjectIds,
    ownerOrganisationIds,
    ownerProjectIds,
    maintainerProjectIds,
    publishedOnlyOrganisationIds,
    publishedOnlyProjectIds,
    canSeeUnpublishedInAnyScope: policy.isStrong || hasOwnerScope || hasMaintainerScope,
    canSeeArchivedInAnyScope: policy.isStrong || hasOwnerScope,
  }
}

/**
 * Computes role-aware layer list policy buckets for the current actor.
 * Used as the central policy primitive for list/read authorization checks.
 */
export const resolveLayerListReadPolicy = (params: {
  user: {
    id?: string | null
    isAnonymous?: boolean | null
    superAdmin?: boolean | null
  }
  userRoles: UserRoleDisco[]
  resourceHubId?: string | null
}): LayerListReadPolicy => {
  const actor = toLayerAuthActor({
    id: params.user.id,
    isAnonymous: params.user.isAnonymous,
    superAdmin: params.user.superAdmin,
    roles: params.userRoles,
  })

  if (!hasAuthenticatedSession(actor)) {
    return {
      allowed: false,
      code: 'UNAUTHENTICATED',
      isStrong: false,
      owner: {
        statePolicy: 'all',
        organisationIds: [],
        projectIds: [],
      },
      maintainer: {
        statePolicy: 'nonArchivedAnyPublish',
        organisationIds: [],
        projectIds: [],
      },
      publishedOnly: {
        statePolicy: 'publishedNonArchived',
        organisationIds: [],
        projectIds: [],
      },
    }
  }

  const isStrong =
    Boolean(actor.isSuperAdmin) ||
    isRelevantHubAdmin(actor.userRoles, params.resourceHubId)

  const ownerOrganisationIds = toUniqueIds(
    actor.userRoles
      .filter(
        (role): role is Extract<UserRoleDisco, { type: 'organisation' }> =>
          role.type === 'organisation' && role.role === 'owner',
      )
      .map(role => role.organisationId),
  )
  const ownerProjectIds = toUniqueIds(
    actor.userRoles
      .filter(
        (role): role is Extract<UserRoleDisco, { type: 'project' }> =>
          role.type === 'project' && role.role === 'owner',
      )
      .map(role => role.projectId),
  )
  const maintainerProjectIds = toUniqueIds(
    actor.userRoles
      .filter(
        (role): role is Extract<UserRoleDisco, { type: 'project' }> =>
          role.type === 'project' && role.role === 'maintainer',
      )
      .map(role => role.projectId),
  )

  const publishedOnlyOrganisationIds = toUniqueIds(
    actor.userRoles
      .filter(
        (role): role is Extract<UserRoleDisco, { type: 'organisation' }> =>
          role.type === 'organisation' && role.role !== 'owner',
      )
      .map(role => role.organisationId),
  )
  const publishedOnlyProjectIds = toUniqueIds(
    actor.userRoles
      .filter(
        (role): role is Extract<UserRoleDisco, { type: 'project' }> =>
          role.type === 'project' &&
          role.role !== 'owner' &&
          role.role !== 'maintainer',
      )
      .map(role => role.projectId),
  )

  const allowed =
    isStrong ||
    ownerOrganisationIds.length > 0 ||
    ownerProjectIds.length > 0 ||
    maintainerProjectIds.length > 0 ||
    publishedOnlyOrganisationIds.length > 0 ||
    publishedOnlyProjectIds.length > 0

  return {
    allowed,
    isStrong,
    owner: {
      statePolicy: 'all',
      organisationIds: ownerOrganisationIds,
      projectIds: ownerProjectIds,
    },
    maintainer: {
      statePolicy: 'nonArchivedAnyPublish',
      organisationIds: [],
      projectIds: maintainerProjectIds,
    },
    publishedOnly: {
      statePolicy: 'publishedNonArchived',
      organisationIds: publishedOnlyOrganisationIds,
      projectIds: publishedOnlyProjectIds,
    },
  }
}

/**
 * Builds base SQL conditions enforcing layer visibility and ownership policy.
 * Used by API query composers before generic query filters are applied.
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

  if (policy.isStrong) {
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
      scopeConditions.push(inArray(layer.organisationId, organisationIds as Id[]))
    }
    if (projectIds.length > 0) {
      scopeConditions.push(inArray(layer.projectId, projectIds as Id[]))
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

  const requestedIsPublished = toTriStateBoolean(params.isPublished) ?? true
  const requestedIsArchived = toTriStateBoolean(params.isArchived) ?? false
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

/**
 * Resolves visibility state policy for a specific layer resource.
 * Used to decide whether archived/unpublished states can be read for that resource.
 */
export const resolveLayerResourceVisibilityPolicy = (
  policy: LayerListReadPolicy,
  resource: LayerAuthTarget,
): LayerVisibilityPolicy | null => {
  if (policy.isStrong) return 'all_states'

  if (
    resource.organisationId &&
    policy.owner.organisationIds.includes(resource.organisationId)
  ) {
    return 'all_states'
  }
  if (resource.projectId && policy.owner.projectIds.includes(resource.projectId)) {
    return 'all_states'
  }
  if (resource.projectId && policy.maintainer.projectIds.includes(resource.projectId)) {
    return 'include_unpublished_exclude_archived'
  }
  if (
    (resource.organisationId &&
      policy.publishedOnly.organisationIds.includes(resource.organisationId)) ||
    (resource.projectId && policy.publishedOnly.projectIds.includes(resource.projectId))
  ) {
    return 'published_only'
  }

  return null
}

/**
 * Authorizes list access for requested layer visibility state.
 * Used before list queries to reject unsupported archived/unpublished filters.
 */
export const authorizeLayerListForContext = (params: {
  user: {
    id?: string | null
    isAnonymous?: boolean | null
    superAdmin?: boolean | null
  }
  userRoles: UserRoleDisco[]
  requestedListState: { isPublished: boolean; isArchived: boolean }
  resourceHubId?: string | null
}): AuthorizationDecision => {
  const policy = resolveLayerListReadPolicy({
    user: params.user,
    userRoles: params.userRoles,
    resourceHubId: params.resourceHubId,
  })

  if (!policy.allowed) {
    const actor = toLayerAuthActor({
      id: params.user.id,
      isAnonymous: params.user.isAnonymous,
      superAdmin: params.user.superAdmin,
      roles: params.userRoles,
    })
    return logLayerReject('list', 'UNAUTHENTICATED', {
      actor,
      requestedState: params.requestedListState,
    })
  }

  const hasOwnerScope =
    policy.isStrong ||
    policy.owner.organisationIds.length > 0 ||
    policy.owner.projectIds.length > 0
  const hasMaintainerScope = policy.maintainer.projectIds.length > 0

  if (params.requestedListState.isArchived) {
    return hasOwnerScope
      ? { allowed: true }
      : { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  if (!params.requestedListState.isPublished) {
    return hasOwnerScope || hasMaintainerScope
      ? { allowed: true }
      : { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  return { allowed: true }
}

/**
 * Authorizes reading a single layer using probe metadata.
 * Used by read endpoints to enforce scope + state visibility in one check.
 */
export const authorizeLayerReadForProbe = (params: {
  user: {
    id?: string | null
    isAnonymous?: boolean | null
    superAdmin?: boolean | null
  }
  userRoles: UserRoleDisco[]
  probe: {
    id: string
    organisationId: string
    projectId: string
    hubId: string | null
    isPublished: boolean
    isArchived: boolean
  }
}): AuthorizationDecision => {
  const policy = resolveLayerListReadPolicy({
    user: params.user,
    userRoles: params.userRoles,
    resourceHubId: params.probe.hubId,
  })
  if (!policy.allowed) {
    const actor = toLayerAuthActor({
      id: params.user.id,
      isAnonymous: params.user.isAnonymous,
      superAdmin: params.user.superAdmin,
      roles: params.userRoles,
    })
    return logLayerReject('read', 'UNAUTHENTICATED', {
      actor,
      target: params.probe,
      requestedState: {
        isPublished: params.probe.isPublished,
        isArchived: params.probe.isArchived,
      },
    })
  }

  const resourcePolicy = resolveLayerResourceVisibilityPolicy(policy, {
    id: params.probe.id,
    organisationId: params.probe.organisationId,
    projectId: params.probe.projectId,
    hubId: params.probe.hubId,
  })
  if (!resourcePolicy) return { allowed: false, code: 'INSUFFICIENT_ROLE' }

  if (params.probe.isArchived) {
    return resourcePolicy === 'all_states'
      ? { allowed: true }
      : { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  if (!params.probe.isPublished) {
    return resourcePolicy === 'all_states' ||
      resourcePolicy === 'include_unpublished_exclude_archived'
      ? { allowed: true }
      : { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  return { allowed: true }
}

/**
 * Extracts submitted layer field keys for field-level policy checks.
 * Used to distinguish i18n-only edits from broader update attempts.
 */
const toLayerSubmittedFields = (data: LayerSubmittedData): string[] => {
  const fields: string[] = []
  if ('code' in data) fields.push('code')
  if ('i18n' in data) fields.push('i18n')
  if ('properties' in data) fields.push('properties')
  if ('isDefaultVisible' in data) fields.push('isDefaultVisible')
  if ('metadata' in data) fields.push('metadata')
  if ('organisationId' in data) fields.push('organisationId')
  if ('projectId' in data) fields.push('projectId')
  return fields
}

/**
 * Authorizes layer creation for submitted payload and resource scope.
 * Used by create commands to enforce owner/super/hub-admin requirements.
 */
export const authorizeLayerCreateForSubmission = (params: {
  user: {
    id?: string | null
    isAnonymous?: boolean | null
    superAdmin?: boolean | null
  }
  userRoles: UserRoleDisco[]
  resource: LayerAuthTarget
  submittedData: LayerSubmittedData
}): AuthorizationDecision => {
  const actor = toLayerAuthActor({
    id: params.user.id,
    isAnonymous: params.user.isAnonymous,
    superAdmin: params.user.superAdmin,
    roles: params.userRoles,
  })

  if (!hasAuthenticatedSession(actor)) {
    return logLayerReject('create', 'UNAUTHENTICATED', {
      actor,
      target: params.resource,
    })
  }

  if (
    actor.isSuperAdmin ||
    isRelevantHubAdmin(actor.userRoles, params.resource.hubId) ||
    hasOrganisationOwnerRole(actor.userRoles, params.resource.organisationId)
  ) {
    return { allowed: true }
  }

  return hasProjectOwnerRole(actor.userRoles, params.resource.projectId)
    ? { allowed: true }
    : logLayerReject('create', 'INSUFFICIENT_ROLE', {
        actor,
        target: params.resource,
        fields: toLayerSubmittedFields(params.submittedData),
      })
}

/**
 * Authorizes layer updates with field-level restrictions.
 * Used to permit i18n-only updates for translators while blocking other fields.
 */
export const authorizeLayerUpdateForSubmission = (params: {
  user: {
    id?: string | null
    isAnonymous?: boolean | null
    superAdmin?: boolean | null
  }
  userRoles: UserRoleDisco[]
  resource: LayerAuthTarget
  submittedData: LayerSubmittedData
}): AuthorizationDecision => {
  const actor = toLayerAuthActor({
    id: params.user.id,
    isAnonymous: params.user.isAnonymous,
    superAdmin: params.user.superAdmin,
    roles: params.userRoles,
  })

  if (!hasAuthenticatedSession(actor)) {
    return logLayerReject('update', 'UNAUTHENTICATED', {
      actor,
      target: params.resource,
    })
  }

  const fields = toLayerSubmittedFields(params.submittedData)

  if (
    actor.isSuperAdmin ||
    isRelevantHubAdmin(actor.userRoles, params.resource.hubId) ||
    hasOrganisationOwnerRole(actor.userRoles, params.resource.organisationId) ||
    hasProjectOwnerRole(actor.userRoles, params.resource.projectId)
  ) {
    return { allowed: true }
  }

  if (fields.length === 0) return { allowed: true }

  const isI18nOnly = fields.every(field => field === 'i18n')
  if (
    isI18nOnly &&
    hasProjectI18nEditorRole(actor.userRoles, params.resource.projectId)
  ) {
    return { allowed: true }
  }

  if (
    !isI18nOnly &&
    hasProjectI18nEditorRole(actor.userRoles, params.resource.projectId)
  ) {
    return logLayerReject('update', 'FIELD_FORBIDDEN', {
      actor,
      target: params.resource,
      fields,
    })
  }

  return logLayerReject('update', 'INSUFFICIENT_ROLE', {
    actor,
    target: params.resource,
    fields,
  })
}

/**
 * Authorizes publish/archive style operations for a layer resource.
 * Used by publish/delete commands that share the same permission gate.
 */
export const authorizeLayerPublishForSubmission = (params: {
  user: {
    id?: string | null
    isAnonymous?: boolean | null
    superAdmin?: boolean | null
  }
  userRoles: UserRoleDisco[]
  resource: LayerAuthTarget
}): AuthorizationDecision => {
  const actor = toLayerAuthActor({
    id: params.user.id,
    isAnonymous: params.user.isAnonymous,
    superAdmin: params.user.superAdmin,
    roles: params.userRoles,
  })

  if (!hasAuthenticatedSession(actor)) {
    return logLayerReject('publish', 'UNAUTHENTICATED', {
      actor,
      target: params.resource,
    })
  }

  return actor.isSuperAdmin ||
    isRelevantHubAdmin(actor.userRoles, params.resource.hubId) ||
    hasOrganisationOwnerRole(actor.userRoles, params.resource.organisationId) ||
    hasProjectOwnerRole(actor.userRoles, params.resource.projectId)
    ? { allowed: true }
    : logLayerReject('publish', 'INSUFFICIENT_ROLE', {
        actor,
        target: params.resource,
      })
}

export const authorizeLayerDeleteForSubmission = authorizeLayerPublishForSubmission

/**
 * Throws a transport-friendly auth error when command decision is denied.
 * Used to bridge policy decisions into remote command error responses.
 */
export const ensureLayerCommandAllowed = (
  decision: AuthorizationDecision,
  _toIssueDetailMessage: (code: string) => string,
): void => {
  if (decision.allowed) return
  throw error(403, toAuthMessage(decision.code ?? 'INSUFFICIENT_ROLE'))
}

/**
 * Resolves UI action flags for layer editing/publishing controls.
 * Used by admin surfaces to render role-appropriate action affordances.
 */
export const resolveLayerActionPermissions = (params: {
  actor: LayerAuthActor
  resource: LayerAuthTarget | null
}): {
  canEditI18n: boolean
  canEditFields: boolean
  canPublish: boolean
  canArchive: boolean
} => {
  const actor = {
    ...toLayerPolicyBase(params.actor),
    userRoles: params.actor.userRoles,
  }
  const resource = params.resource

  if (!resource) {
    return {
      canEditI18n: false,
      canEditFields: false,
      canPublish: false,
      canArchive: false,
    }
  }

  const isStrong =
    Boolean(actor.isSuperAdmin) || isRelevantHubAdmin(actor.userRoles, resource.hubId)
  const isOrgOwner = hasOrganisationOwnerRole(actor.userRoles, resource.organisationId)
  const isProjectOwner = hasProjectOwnerRole(actor.userRoles, resource.projectId)
  const canI18nEditor = hasProjectI18nEditorRole(actor.userRoles, resource.projectId)

  const canEditFields = isStrong || isOrgOwner || isProjectOwner
  const canEditI18n = canEditFields || canI18nEditor
  const canPublish = canEditFields

  return {
    canEditI18n,
    canEditFields,
    canPublish,
    canArchive: canPublish,
  }
}

/**
 * Resolves scope constraints for layer creation project selection.
 * Used to restrict selectable projects/orgs/hubs in create flows.
 */
export const resolveLayerProjectSelectionScope = (params: {
  actor: LayerAuthActor
  resourceHubId?: string | null
}): LayerProjectSelectionScope => {
  const actor = toLayerPolicyBase(params.actor)
  const userRoles = params.actor.userRoles

  if (!hasAuthenticatedSession(params.actor)) {
    return {
      canCreate: false,
      allowAll: false,
      allowedHubIds: [],
      allowedOrganisationIds: [],
      allowedProjectIds: [],
    }
  }

  if (actor.isSuperAdmin) {
    return {
      canCreate: true,
      allowAll: true,
      allowedHubIds: [],
      allowedOrganisationIds: [],
      allowedProjectIds: [],
    }
  }

  const allowedHubIds =
    params.resourceHubId &&
    isRelevantHubAdmin(userRoles, params.resourceHubId) &&
    params.resourceHubId.trim().length > 0
      ? [params.resourceHubId]
      : []

  const allowedOrganisationIds = toUniqueIds(
    userRoles
      .filter(
        (role): role is Extract<UserRoleDisco, { type: 'organisation' }> =>
          role.type === 'organisation' && role.role === 'owner',
      )
      .map(role => role.organisationId),
  )

  const allowedProjectIds = toUniqueIds(
    userRoles
      .filter(
        (role): role is Extract<UserRoleDisco, { type: 'project' }> =>
          role.type === 'project' &&
          (role.role === 'owner' || role.role === 'maintainer'),
      )
      .map(role => role.projectId),
  )

  return {
    canCreate:
      allowedHubIds.length > 0 ||
      allowedOrganisationIds.length > 0 ||
      allowedProjectIds.length > 0,
    allowAll: false,
    allowedHubIds,
    allowedOrganisationIds,
    allowedProjectIds,
  }
}
