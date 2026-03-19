import { error } from '@sveltejs/kit'
import { shouldLogAuthzDeny, toActorPolicyBase } from '.'
import { isCoreHubAdmin, isRelevantHubAdmin } from './hub'
import type { AuthorizationDecision, UserRoleDisco } from '$lib/types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. AUTH INPUT TYPES
//    - FeatureAuthActor
//    - FeatureAuthTarget
//    - FeatureSubmittedData
//
// 2. INPUT NORMALIZERS
//    - toFeatureAuthActor
//    - toFeatureSubmittedFields
//
// 3. AUTHORIZATION
//    - authorizeFeatureListForContext
//    - authorizeFeatureReadForProbe
//    - authorizeFeatureCreateForSubmission
//    - authorizeFeatureUpdateForSubmission
//    - authorizeFeaturePublishForSubmission
//    - authorizeFeatureDeleteForSubmission
//    - ensureFeatureCommandAllowed

type FeaturePolicyCode =
  | 'UNAUTHENTICATED'
  | 'INSUFFICIENT_ROLE'
  | 'FIELD_FORBIDDEN'
  | 'REQUEST_STATE_REQUIRED'

export type FeatureAuthActor = {
  userId?: string | null
  userRoles: UserRoleDisco[]
  isAuthenticated?: boolean
  isAnonymous?: boolean
  isSuperAdmin?: boolean
}

export type FeatureAuthTarget = {
  id?: string
  organisationId?: string | null
  projectId?: string | null
  layerId?: string | null
  resourceHubId?: string | null
}

export type FeatureSubmittedData = Partial<{
  i18n: unknown
  properties: unknown
  geometry: unknown
  addressMeta: unknown
  isIntangible: boolean
  isVisitable: boolean
  isPendingReview: boolean
  organisationId: string
  projectId: string
  layerId: string
}>

type FeatureRequestedState = {
  isPublished?: boolean | null
  isArchived?: boolean | null
}

const FEATURE_AUTHZ_DENY_LOG_SCOPE = '[authz][feature][deny]'

const logFeatureReject = (
  scope: string,
  code: FeaturePolicyCode,
  params: {
    actor: FeatureAuthActor
    target?: FeatureAuthTarget
    fields?: string[]
    requestedState?: FeatureRequestedState
  },
): AuthorizationDecision => {
  if (shouldLogAuthzDeny()) {
    console.log(`${FEATURE_AUTHZ_DENY_LOG_SCOPE}[${scope}]`, {
      code,
      userId: params.actor.userId ?? null,
      isAuthenticated: params.actor.isAuthenticated ?? null,
      isAnonymous: params.actor.isAnonymous ?? null,
      isSuperAdmin: params.actor.isSuperAdmin ?? false,
      userRoleCount: params.actor.userRoles.length,
      target: params.target ?? null,
      fields: params.fields ?? null,
      requestedState: params.requestedState ?? null,
    })
  }

  return { allowed: false, code }
}

const hasAuthenticatedSession = (actor: FeatureAuthActor): boolean =>
  Boolean(actor.isAuthenticated && actor.userId && !actor.isAnonymous)

const hasProjectRole = (
  roles: UserRoleDisco[],
  projectId: string | null | undefined,
  allowedRoles: string[],
): boolean =>
  Boolean(projectId) &&
  roles.some(
    role =>
      role.type === 'project' &&
      role.projectId === projectId &&
      allowedRoles.includes(role.role),
  )

const hasAnyProjectRole = (roles: UserRoleDisco[], allowedRoles: string[]): boolean =>
  roles.some(role => role.type === 'project' && allowedRoles.includes(role.role))

const canManageFeatureProject = (
  actor: FeatureAuthActor,
  target: FeatureAuthTarget,
): boolean => {
  if (actor.isSuperAdmin) return true
  if (isRelevantHubAdmin(actor.userRoles, target.resourceHubId)) return true
  return hasProjectRole(actor.userRoles, target.projectId, ['owner', 'maintainer'])
}

const canTranslateFeatureProject = (
  actor: FeatureAuthActor,
  target: FeatureAuthTarget,
): boolean => {
  if (canManageFeatureProject(actor, target)) return true
  return hasProjectRole(actor.userRoles, target.projectId, ['translator'])
}

export const toFeatureAuthActor = (user: {
  id?: string | null
  isAnonymous?: boolean | null
  superAdmin?: boolean | null
  roles?: UserRoleDisco[]
}): FeatureAuthActor => {
  const userRoles = Array.isArray(user.roles) ? user.roles : []

  return {
    ...toActorPolicyBase({
      userId: user.id ?? null,
      userRoles,
      isAnonymous: user.isAnonymous === true,
      isAuthenticated: Boolean(user.id) && user.isAnonymous !== true,
      isSuperAdmin: Boolean(user.superAdmin) || isCoreHubAdmin(userRoles),
    }),
  }
}

export const toFeatureSubmittedFields = (
  data: Partial<Record<string, unknown>>,
): string[] => {
  const fields: string[] = []
  if ('i18n' in data) fields.push('i18n')
  if ('properties' in data) fields.push('properties')
  if ('geometry' in data) fields.push('geometry')
  if ('addressMeta' in data) fields.push('addressMeta')
  if ('isIntangible' in data) fields.push('isIntangible')
  if ('isVisitable' in data) fields.push('isVisitable')
  if ('isPendingReview' in data) fields.push('isPendingReview')
  if ('organisationId' in data) fields.push('organisationId')
  if ('projectId' in data) fields.push('projectId')
  if ('layerId' in data) fields.push('layerId')
  if ('isPublished' in data) fields.push('isPublished')
  if ('isArchived' in data) fields.push('isArchived')
  return fields
}

/**
 * Evaluates whether the caller can request a feature list with the desired visibility.
 */
export const authorizeFeatureListForContext = (params: {
  user: {
    id?: string | null
    isAnonymous?: boolean | null
    superAdmin?: boolean | null
  }
  userRoles: UserRoleDisco[]
  requestedListState?: FeatureRequestedState
  resourceHubId?: string | null
}): AuthorizationDecision => {
  const actor = toFeatureAuthActor({
    id: params.user.id,
    isAnonymous: params.user.isAnonymous,
    superAdmin: params.user.superAdmin,
    roles: params.userRoles,
  })

  if (actor.isSuperAdmin || isRelevantHubAdmin(actor.userRoles, params.resourceHubId)) {
    return { allowed: true }
  }

  const requestedState = params.requestedListState ?? {}
  const requestsArchived = requestedState.isArchived === true
  const requestsUnpublished = requestedState.isPublished === false

  if (!hasAuthenticatedSession(actor)) {
    if (requestsArchived || requestsUnpublished) {
      return logFeatureReject('list', 'UNAUTHENTICATED', {
        actor,
        requestedState,
      })
    }
    return { allowed: true }
  }

  // This is a capability gate only. Actual project scoping is enforced by
  // `api/services/feature.ts::toQueryConditions(...)`.
  if (hasAnyProjectRole(actor.userRoles, ['owner', 'maintainer'])) {
    return { allowed: true }
  }

  if (hasAnyProjectRole(actor.userRoles, ['translator'])) {
    if (requestsArchived) {
      return logFeatureReject('list', 'INSUFFICIENT_ROLE', {
        actor,
        requestedState,
      })
    }
    return { allowed: true }
  }

  if (requestsArchived || requestsUnpublished) {
    return logFeatureReject('list', 'INSUFFICIENT_ROLE', {
      actor,
      requestedState,
    })
  }

  return { allowed: true }
}

/**
 * Evaluates read access against persisted feature visibility and project scope.
 */
export const authorizeFeatureReadForProbe = (params: {
  user: {
    id?: string | null
    isAnonymous?: boolean | null
    superAdmin?: boolean | null
  }
  userRoles: UserRoleDisco[]
  probe: FeatureAuthTarget & { isPublished: boolean; isArchived: boolean }
}): AuthorizationDecision => {
  const actor = toFeatureAuthActor({
    id: params.user.id,
    isAnonymous: params.user.isAnonymous,
    superAdmin: params.user.superAdmin,
    roles: params.userRoles,
  })

  if (!params.probe.isArchived && params.probe.isPublished) {
    return { allowed: true }
  }

  if (!hasAuthenticatedSession(actor)) {
    return logFeatureReject('read', 'UNAUTHENTICATED', {
      actor,
      target: params.probe,
      requestedState: {
        isPublished: params.probe.isPublished,
        isArchived: params.probe.isArchived,
      },
    })
  }

  if (canManageFeatureProject(actor, params.probe)) {
    return { allowed: true }
  }

  if (!params.probe.isArchived && canTranslateFeatureProject(actor, params.probe)) {
    return { allowed: true }
  }

  return logFeatureReject('read', 'INSUFFICIENT_ROLE', {
    actor,
    target: params.probe,
    requestedState: {
      isPublished: params.probe.isPublished,
      isArchived: params.probe.isArchived,
    },
  })
}

/**
 * Evaluates create access for feature submissions.
 * Programmatic non-admin callers are allowed if they have maintainer scope.
 */
export const authorizeFeatureCreateForSubmission = (params: {
  user: {
    id?: string | null
    isAnonymous?: boolean | null
    superAdmin?: boolean | null
  }
  userRoles: UserRoleDisco[]
  resource: FeatureAuthTarget
  submittedData?: FeatureSubmittedData
}): AuthorizationDecision => {
  const actor = toFeatureAuthActor({
    id: params.user.id,
    isAnonymous: params.user.isAnonymous,
    superAdmin: params.user.superAdmin,
    roles: params.userRoles,
  })

  if (!hasAuthenticatedSession(actor)) {
    return logFeatureReject('create', 'UNAUTHENTICATED', {
      actor,
      target: params.resource,
      fields: toFeatureSubmittedFields(params.submittedData ?? {}),
    })
  }

  if (canManageFeatureProject(actor, params.resource)) {
    return { allowed: true }
  }

  return logFeatureReject('create', 'INSUFFICIENT_ROLE', {
    actor,
    target: params.resource,
    fields: toFeatureSubmittedFields(params.submittedData ?? {}),
  })
}

/**
 * Evaluates update access for feature submissions.
 * Translator-only actors are limited to pure i18n updates.
 */
export const authorizeFeatureUpdateForSubmission = (params: {
  user: {
    id?: string | null
    isAnonymous?: boolean | null
    superAdmin?: boolean | null
  }
  userRoles: UserRoleDisco[]
  resource: FeatureAuthTarget
  submittedData?: FeatureSubmittedData
}): AuthorizationDecision => {
  const actor = toFeatureAuthActor({
    id: params.user.id,
    isAnonymous: params.user.isAnonymous,
    superAdmin: params.user.superAdmin,
    roles: params.userRoles,
  })
  const fields = toFeatureSubmittedFields(params.submittedData ?? {})

  if (!hasAuthenticatedSession(actor)) {
    return logFeatureReject('update', 'UNAUTHENTICATED', {
      actor,
      target: params.resource,
      fields,
    })
  }

  if (canManageFeatureProject(actor, params.resource)) {
    return { allowed: true }
  }

  const isI18nOnly = fields.length > 0 && fields.every(field => field === 'i18n')
  if (isI18nOnly && canTranslateFeatureProject(actor, params.resource)) {
    return { allowed: true }
  }

  return logFeatureReject('update', 'FIELD_FORBIDDEN', {
    actor,
    target: params.resource,
    fields,
  })
}

/**
 * Evaluates publish access for feature commands.
 */
export const authorizeFeaturePublishForSubmission = (params: {
  user: {
    id?: string | null
    isAnonymous?: boolean | null
    superAdmin?: boolean | null
  }
  userRoles: UserRoleDisco[]
  resource: FeatureAuthTarget
}): AuthorizationDecision => {
  const actor = toFeatureAuthActor({
    id: params.user.id,
    isAnonymous: params.user.isAnonymous,
    superAdmin: params.user.superAdmin,
    roles: params.userRoles,
  })

  if (!hasAuthenticatedSession(actor)) {
    return logFeatureReject('publish', 'UNAUTHENTICATED', {
      actor,
      target: params.resource,
    })
  }

  if (canManageFeatureProject(actor, params.resource)) {
    return { allowed: true }
  }

  return logFeatureReject('publish', 'INSUFFICIENT_ROLE', {
    actor,
    target: params.resource,
  })
}

/**
 * Evaluates archive access for feature commands.
 */
export const authorizeFeatureDeleteForSubmission = (params: {
  user: {
    id?: string | null
    isAnonymous?: boolean | null
    superAdmin?: boolean | null
  }
  userRoles: UserRoleDisco[]
  resource: FeatureAuthTarget
}): AuthorizationDecision => authorizeFeaturePublishForSubmission(params)

/**
 * Throws a standard 403 when a command decision is denied.
 */
export const ensureFeatureCommandAllowed = (
  decision: AuthorizationDecision,
  toMessage: (code: string) => string,
): void => {
  if (decision.allowed) return
  throw error(403, toMessage(decision.code ?? 'INSUFFICIENT_ROLE'))
}
