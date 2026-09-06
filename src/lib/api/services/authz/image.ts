// TYPES
import type { UserRoleDisco, AuthorizationDecision } from '$lib/types'

export type ImageAuthActor = {
  userId?: string | null
  userRoles: UserRoleDisco[]
  isAuthenticated?: boolean
  isAnonymous?: boolean
  isSuperAdmin?: boolean
}

export type ImageAuthTarget = {
  ctxType: 'hub' | 'organisation' | 'project' | 'feature' | 'user' | 'task'
  ctxId: string
  resourceHubId?: string | null
  projectId?: string | null
  organisationId?: string | null
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

/**
 * Resolves admin image visibility from the target's persisted resource chain.
 * @param actor Current account and roles.
 * @param target Resolved image context.
 * @returns Whether an applicable administrative role or personal ownership exists.
 */
const canReadAdminImages = (
  actor: ImageAuthActor,
  target: ImageAuthTarget,
): boolean => {
  if (actor.isSuperAdmin || isRelevantHubAdmin(actor.userRoles, target.resourceHubId))
    return true
  if (target.ctxType === 'user') return target.ctxId === actor.userId
  const organisationId =
    target.organisationId ??
    (target.ctxType === 'organisation' ? target.ctxId : undefined)
  const projectId =
    target.projectId ?? (target.ctxType === 'project' ? target.ctxId : undefined)
  return actor.userRoles.some(
    role =>
      (role.type === 'organisation' &&
        Boolean(organisationId) &&
        role.organisationId === organisationId &&
        role.role === 'owner') ||
      (role.type === 'project' &&
        Boolean(projectId) &&
        role.projectId === projectId &&
        ['owner', 'maintainer', 'member'].includes(role.role)),
  )
}

/**
 * Checks image collection visibility for the current actor.
 * @param actor Session and roles.
 * @param target Resource context.
 * @param requestedState Requested visibility state.
 * @param options Request mode.
 * @returns The authorization decision.
 */
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
    // A guest session never grants access to unpublished admin image data.
    if (actor.isAnonymous) return { allowed: false, code: 'ACCOUNT_REQUIRED' }
    // Admin mode does not itself grant access to a resource chain.
    return canReadAdminImages(actor, target)
      ? { allowed: true }
      : { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  if (target.ctxType === 'user') {
    return target.ctxId === actor.userId
      ? { allowed: true }
      : { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  if (requestedState.isPublished === false) {
    return { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  return { allowed: true }
}

/**
 * Checks individual image visibility for the current actor.
 * @param actor Session and roles.
 * @param target Resource context.
 * @param requestedState Requested visibility state.
 * @param options Request mode.
 * @returns The authorization decision.
 */
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
    // Apply the account boundary before the transitional admin permission branch.
    if (actor.isAnonymous) return { allowed: false, code: 'ACCOUNT_REQUIRED' }
    // Resolve the same scoped policy for individual reads and collection reads.
    return canReadAdminImages(actor, target)
      ? { allowed: true }
      : { allowed: false, code: 'INSUFFICIENT_ROLE' }
  }

  if (target.ctxType === 'user') {
    return target.ctxId === actor.userId
      ? { allowed: true }
      : { allowed: false, code: 'INSUFFICIENT_ROLE' }
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
