// TYPES
import type { UserRoleDisco, AuthorizationDecision } from '$lib/types'

export type ImageAuthActor = {
  userId?: string | null
  userRoles: UserRoleDisco[]
  isAuthenticated?: boolean
  isAnonymous?: boolean
}

export type ImageAuthTarget = {
  ctxType: 'hub' | 'organisation' | 'project' | 'feature' | 'user' | 'task'
  ctxId: string
  resourceHubId?: string | null
}

export type ImageRequestedState = {
  isPublished?: boolean
  isArchived?: boolean
}

const isHubAdminRole = (role: UserRoleDisco): boolean =>
  role.type === 'hub' && role.role === 'admin'

const isCoreHubAdmin = (roles: UserRoleDisco[]): boolean =>
  roles.some(
    role =>
      isHubAdminRole(role) &&
      (role as { hub?: { code?: string | null } }).hub?.code === 'core',
  )

const getScopedHubAdminIds = (roles: UserRoleDisco[]): Set<string> =>
  new Set(
    roles
      .filter(role => isHubAdminRole(role))
      .filter(role => (role as { hub?: { code?: string | null } }).hub?.code !== 'core')
      .map(role => (role as { hubId: string }).hubId),
  )

const hasAuthenticatedSession = (actor: ImageAuthActor): boolean => {
  if (actor.isAuthenticated !== undefined) return actor.isAuthenticated
  return Boolean(actor.userId)
}

const isRelevantHubAdmin = (
  roles: UserRoleDisco[],
  resourceHubId?: string | null,
): boolean => {
  if (isCoreHubAdmin(roles)) return true
  if (!resourceHubId) return false
  return getScopedHubAdminIds(roles).has(resourceHubId)
}

export const authorizeImageList = (
  actor: ImageAuthActor,
  target: ImageAuthTarget,
  requestedState: ImageRequestedState,
  options?: { isAdminRequest?: boolean },
): AuthorizationDecision => {
  if (!hasAuthenticatedSession(actor) || !actor.userId) {
    return { allowed: false, code: 'UNAUTHENTICATED' }
  }

  if (requestedState.isArchived) {
    return { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  if (options?.isAdminRequest) {
    // TODO AUTHZ(image/list): Enforce role-scoped admin access by resource chain.
    // Keep permissive in admin mode until feature remote authz parity is implemented.
    return { allowed: true }
  }

  if (target.ctxType === 'user') {
    return { allowed: true }
  }

  if (requestedState.isPublished === false) {
    return { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  return { allowed: true }
}

export const authorizeImageRead = (
  actor: ImageAuthActor,
  target: ImageAuthTarget,
  requestedState: ImageRequestedState,
  options?: { isAdminRequest?: boolean },
): AuthorizationDecision => {
  if (!hasAuthenticatedSession(actor) || !actor.userId) {
    return { allowed: false, code: 'UNAUTHENTICATED' }
  }

  if (requestedState.isArchived) {
    return { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  if (options?.isAdminRequest) {
    // TODO AUTHZ(image/read): Enforce role-scoped admin access by resource chain.
    return { allowed: true }
  }

  if (target.ctxType === 'user') {
    return { allowed: true }
  }

  if (requestedState.isPublished === false) {
    return { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  if (
    target.resourceHubId &&
    isRelevantHubAdmin(actor.userRoles, target.resourceHubId)
  ) {
    return { allowed: true }
  }

  return { allowed: true }
}
