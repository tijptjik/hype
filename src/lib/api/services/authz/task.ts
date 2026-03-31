import { shouldLogAuthzDeny, toActorPolicyBase } from '.'
import { isCoreHubAdmin, isRelevantHubAdmin } from './hub'
import { hasAuthenticatedSession } from './user'
import type { AuthorizationDecision, UserRoleDisco } from '$lib/types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. AUTH INPUT TYPES
//    - TaskAuthActor
//    - TaskAuthTarget
//
// 2. POLICY CONSTANTS
//    - TASK_AUTHZ_DENY_LOG_SCOPE
//    - logTaskReject
//
// 3. ROLE RESOLUTION
//    - hasProjectRole
//    - hasOrganisationOwnerRole
//    - hasScopedTaskListAccess
//    - canReadTaskProject
//    - canManageTaskProject
//
// 4. ACTOR RESOLUTION
//    - toTaskAuthActor
//
// 5. AUTHORIZATION
//    - authorizeTaskListForContext
//    - authorizeTaskReadForProbe
//    - authorizeTaskReassignForProbe

type TaskPolicyCode = 'UNAUTHENTICATED' | 'INSUFFICIENT_ROLE'

export type TaskAuthActor = {
  userId?: string | null
  userRoles: UserRoleDisco[]
  isAuthenticated?: boolean
  isAnonymous?: boolean
  isSuperAdmin?: boolean
}

export type TaskAuthTarget = {
  id?: string
  organisationId?: string | null
  projectId?: string | null
  organisationIds?: string[]
  projectIds?: string[]
  resourceHubId?: string | null
}

const TASK_AUTHZ_DENY_LOG_SCOPE = '[authz][task][deny]'

const logTaskReject = (
  scope: string,
  code: TaskPolicyCode,
  params: {
    actor: TaskAuthActor
    target?: TaskAuthTarget
    isAdminRequest?: boolean
  },
): AuthorizationDecision => {
  if (shouldLogAuthzDeny()) {
    console.log(`${TASK_AUTHZ_DENY_LOG_SCOPE}[${scope}]`, {
      code,
      userId: params.actor.userId ?? null,
      isAuthenticated: params.actor.isAuthenticated ?? null,
      isAnonymous: params.actor.isAnonymous ?? null,
      isSuperAdmin: params.actor.isSuperAdmin ?? false,
      userRoleCount: params.actor.userRoles.length,
      target: params.target ?? null,
      isAdminRequest: params.isAdminRequest ?? null,
    })
  }

  return { allowed: false, code }
}

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

const hasOrganisationOwnerRole = (
  roles: UserRoleDisco[],
  organisationId: string | null | undefined,
): boolean =>
  Boolean(organisationId) &&
  roles.some(
    role =>
      role.type === 'organisation' &&
      role.organisationId === organisationId &&
      role.role === 'owner',
  )

const hasScopedTaskListAccess = (
  actor: TaskAuthActor,
  target: TaskAuthTarget,
): boolean => {
  if (actor.isSuperAdmin) return true
  if (isRelevantHubAdmin(actor.userRoles, target.resourceHubId)) return true

  const organisationIds = target.organisationIds ?? []
  const projectIds = target.projectIds ?? []

  if (organisationIds.length === 0 && projectIds.length === 0) {
    return false
  }

  const hasOwnedOrganisationScope =
    organisationIds.length > 0 &&
    organisationIds.every(organisationId =>
      hasOrganisationOwnerRole(actor.userRoles, organisationId),
    )

  const hasManagedProjectScope =
    projectIds.length > 0 &&
    projectIds.every(projectId =>
      hasProjectRole(actor.userRoles, projectId, ['owner', 'maintainer']),
    )

  return hasOwnedOrganisationScope || hasManagedProjectScope
}

const canReadTaskProject = (actor: TaskAuthActor, target: TaskAuthTarget): boolean => {
  if (actor.isSuperAdmin) return true
  if (isRelevantHubAdmin(actor.userRoles, target.resourceHubId)) return true
  if (hasOrganisationOwnerRole(actor.userRoles, target.organisationId)) return true
  return hasProjectRole(actor.userRoles, target.projectId, ['owner', 'maintainer'])
}

const canManageTaskProject = (
  actor: TaskAuthActor,
  target: TaskAuthTarget,
): boolean => {
  if (actor.isSuperAdmin) return true
  if (isRelevantHubAdmin(actor.userRoles, target.resourceHubId)) return true
  return hasProjectRole(actor.userRoles, target.projectId, ['owner', 'maintainer'])
}

export const toTaskAuthActor = (user: {
  id?: string | null
  isAnonymous?: boolean | null
  superAdmin?: boolean | null
  roles?: UserRoleDisco[]
}): TaskAuthActor => {
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

export const authorizeTaskListForContext = (params: {
  user: {
    id?: string | null
    isAnonymous?: boolean | null
    superAdmin?: boolean | null
  }
  userRoles: UserRoleDisco[]
  isAdminRequest: boolean
  organisationIds?: string[]
  projectIds?: string[]
  resourceHubId?: string | null
}): AuthorizationDecision => {
  const actor = toTaskAuthActor({
    id: params.user.id,
    isAnonymous: params.user.isAnonymous,
    superAdmin: params.user.superAdmin,
    roles: params.userRoles,
  })

  if (!params.isAdminRequest) {
    return logTaskReject('list', 'INSUFFICIENT_ROLE', {
      actor,
      isAdminRequest: false,
      target: {
        organisationIds: params.organisationIds ?? [],
        projectIds: params.projectIds ?? [],
        resourceHubId: params.resourceHubId ?? null,
      },
    })
  }

  if (!hasAuthenticatedSession(actor)) {
    return logTaskReject('list', 'UNAUTHENTICATED', {
      actor,
      isAdminRequest: true,
      target: {
        organisationIds: params.organisationIds ?? [],
        projectIds: params.projectIds ?? [],
        resourceHubId: params.resourceHubId ?? null,
      },
    })
  }

  if (
    hasScopedTaskListAccess(actor, {
      organisationIds: params.organisationIds ?? [],
      projectIds: params.projectIds ?? [],
      resourceHubId: params.resourceHubId ?? null,
    })
  ) {
    return { allowed: true }
  }

  return logTaskReject('list', 'INSUFFICIENT_ROLE', {
    actor,
    isAdminRequest: true,
    target: {
      organisationIds: params.organisationIds ?? [],
      projectIds: params.projectIds ?? [],
      resourceHubId: params.resourceHubId ?? null,
    },
  })
}

export const authorizeTaskReadForProbe = (params: {
  user: {
    id?: string | null
    isAnonymous?: boolean | null
    superAdmin?: boolean | null
  }
  userRoles: UserRoleDisco[]
  isAdminRequest: boolean
  probe: TaskAuthTarget
}): AuthorizationDecision => {
  const actor = toTaskAuthActor({
    id: params.user.id,
    isAnonymous: params.user.isAnonymous,
    superAdmin: params.user.superAdmin,
    roles: params.userRoles,
  })

  if (!params.isAdminRequest) {
    return logTaskReject('read', 'INSUFFICIENT_ROLE', {
      actor,
      target: params.probe,
      isAdminRequest: false,
    })
  }

  if (!hasAuthenticatedSession(actor)) {
    return logTaskReject('read', 'UNAUTHENTICATED', {
      actor,
      target: params.probe,
      isAdminRequest: true,
    })
  }

  if (canReadTaskProject(actor, params.probe)) {
    return { allowed: true }
  }

  return logTaskReject('read', 'INSUFFICIENT_ROLE', {
    actor,
    target: params.probe,
    isAdminRequest: true,
  })
}

export const authorizeTaskReassignForProbe = (params: {
  user: {
    id?: string | null
    isAnonymous?: boolean | null
    superAdmin?: boolean | null
  }
  userRoles: UserRoleDisco[]
  isAdminRequest: boolean
  probe: TaskAuthTarget
}): AuthorizationDecision => {
  const actor = toTaskAuthActor({
    id: params.user.id,
    isAnonymous: params.user.isAnonymous,
    superAdmin: params.user.superAdmin,
    roles: params.userRoles,
  })

  if (!params.isAdminRequest) {
    return logTaskReject('reassign', 'INSUFFICIENT_ROLE', {
      actor,
      target: params.probe,
      isAdminRequest: false,
    })
  }

  if (!hasAuthenticatedSession(actor)) {
    return logTaskReject('reassign', 'UNAUTHENTICATED', {
      actor,
      target: params.probe,
      isAdminRequest: true,
    })
  }

  if (canManageTaskProject(actor, params.probe)) {
    return { allowed: true }
  }

  return logTaskReject('reassign', 'INSUFFICIENT_ROLE', {
    actor,
    target: params.probe,
    isAdminRequest: true,
  })
}
