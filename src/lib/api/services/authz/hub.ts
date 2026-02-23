// DRIZZLE
import { eq, inArray } from 'drizzle-orm'
// SCHEMA
import { hub } from '$lib/db/schema'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { AuthorizationDecision, Id, UserRoleDisco } from '$lib/types'

export type HubAuthActor = {
  userId?: string | null
  userRoles: UserRoleDisco[]
  isAuthenticated?: boolean
  isAnonymous?: boolean
}

export type HubAuthTarget = {
  resourceId?: string
  resourceHubId?: string | null
}

type HubAuthorizationField =
  | 'code'
  | 'domain'
  | 'i18n'
  | 'userRoles'
  | 'organisations'
  | 'isPublished'
  | 'isArchived'

export type HubActionPermissions = {
  canCreate: boolean
  canEdit: boolean
  canPublish: boolean
  canDelete: boolean
}

export type HubRequestedListState = {
  isPublished?: boolean
  isArchived?: boolean
}

const CORE_HUB_CODE = 'core'

const isHubAdminRole = (role: UserRoleDisco): boolean =>
  role.type === 'hub' && role.role === 'admin'

export const isCoreHubAdmin = (roles: UserRoleDisco[]): boolean =>
  roles.some(
    role =>
      isHubAdminRole(role) &&
      (role as { hub?: { code?: string | null } }).hub?.code === CORE_HUB_CODE,
  )

export const getScopedHubAdminIds = (roles: UserRoleDisco[]): Set<string> =>
  new Set(
    roles
      .filter(role => isHubAdminRole(role))
      .filter(
        role =>
          (role as { hub?: { code?: string | null } }).hub?.code !== CORE_HUB_CODE,
      )
      .map(role => (role as { hubId: string }).hubId),
  )

export const toHubListConditions = (
  roles: UserRoleDisco[],
  requestedListState: HubRequestedListState,
): SQL<unknown>[] => {
  const isCoreAdmin = isCoreHubAdmin(roles)
  const scopedHubIds = Array.from(getScopedHubAdminIds(roles))

  return [
    ...(!isCoreAdmin && scopedHubIds.length > 0 ? [inArray(hub.id, scopedHubIds)] : []),
    ...(!isCoreAdmin && scopedHubIds.length === 0
      ? [eq(hub.id, '__none__' as Id)]
      : []),
    ...(requestedListState.isPublished === undefined
      ? []
      : [eq(hub.isPublished, requestedListState.isPublished)]),
    ...(requestedListState.isArchived === undefined
      ? []
      : [eq(hub.isArchived, requestedListState.isArchived)]),
  ]
}

const hasAuthenticatedSession = (actor: HubAuthActor): boolean => {
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

export const toHubSubmittedFields = (
  data: Partial<Record<HubAuthorizationField, unknown>>,
): HubAuthorizationField[] => {
  const fields: HubAuthorizationField[] = []
  if ('code' in data) fields.push('code')
  if ('domain' in data) fields.push('domain')
  if ('i18n' in data) fields.push('i18n')
  if ('userRoles' in data) fields.push('userRoles')
  if ('organisations' in data) fields.push('organisations')
  if ('isPublished' in data) fields.push('isPublished')
  if ('isArchived' in data) fields.push('isArchived')
  return fields
}

export const toHubUserRoleSignature = (
  userRoles: Array<{ userId: string; role: string }>,
): string =>
  userRoles
    .map(role => `${role.userId}:${role.role}`)
    .sort((a, b) => a.localeCompare(b))
    .join('|')

export const toHubAuthActor = (user: unknown): HubAuthActor => {
  if (!user || typeof user !== 'object') {
    return {
      userId: undefined,
      userRoles: [],
      isAuthenticated: false,
      isAnonymous: false,
    }
  }

  const userId = (() => {
    const value = (user as { id?: unknown }).id
    return typeof value === 'string' ? value : undefined
  })()

  const userRoles = (() => {
    const value = (user as { roles?: unknown }).roles
    return Array.isArray(value) ? (value as UserRoleDisco[]) : []
  })()

  const isAnonymous = (user as { isAnonymous?: unknown }).isAnonymous === true

  return {
    userId,
    userRoles,
    isAuthenticated: Boolean(userId) && !isAnonymous,
    isAnonymous,
  }
}

export const authorizeHubRead = (
  actor: HubAuthActor,
  target: Required<Pick<HubAuthTarget, 'resourceHubId'>>,
): AuthorizationDecision => {
  if (!hasAuthenticatedSession(actor)) {
    return { allowed: false, code: 'UNAUTHENTICATED' }
  }

  return isRelevantHubAdmin(actor.userRoles, target.resourceHubId)
    ? { allowed: true }
    : { allowed: false, code: 'INSUFFICIENT_ROLE' }
}

export const authorizeHubReadForProbe = (params: {
  user: { id: string; isAnonymous?: boolean }
  userRoles: UserRoleDisco[]
  probe: { id: string }
}): AuthorizationDecision =>
  authorizeHubRead(
    {
      userId: params.user.id,
      userRoles: params.userRoles,
      isAuthenticated: true,
      isAnonymous: params.user.isAnonymous === true,
    },
    {
      resourceHubId: params.probe.id,
    },
  )

export const authorizeHubList = (actor: HubAuthActor): AuthorizationDecision => {
  if (!hasAuthenticatedSession(actor)) {
    return { allowed: false, code: 'UNAUTHENTICATED' }
  }

  const hasHubAdminRole = actor.userRoles.some(isHubAdminRole)
  return hasHubAdminRole
    ? { allowed: true }
    : { allowed: false, code: 'INSUFFICIENT_ROLE' }
}

export const authorizeHubCreate = (
  actor: HubAuthActor,
  _fields: HubAuthorizationField[],
): AuthorizationDecision => {
  if (!hasAuthenticatedSession(actor)) {
    return { allowed: false, code: 'UNAUTHENTICATED' }
  }

  return isCoreHubAdmin(actor.userRoles)
    ? { allowed: true }
    : { allowed: false, code: 'HUB_SCOPE_FORBIDDEN' }
}

export const authorizeHubUpdate = (
  actor: HubAuthActor,
  target: Required<Pick<HubAuthTarget, 'resourceId' | 'resourceHubId'>>,
  _fields: HubAuthorizationField[],
): AuthorizationDecision => {
  if (!hasAuthenticatedSession(actor)) {
    return { allowed: false, code: 'UNAUTHENTICATED' }
  }

  if (!target.resourceId) return { allowed: false, code: 'INSUFFICIENT_ROLE' }

  return isRelevantHubAdmin(actor.userRoles, target.resourceHubId)
    ? { allowed: true }
    : { allowed: false, code: 'INSUFFICIENT_ROLE' }
}

export const authorizeHubManageRoles = (
  actor: HubAuthActor,
  target: Required<Pick<HubAuthTarget, 'resourceId' | 'resourceHubId'>>,
): AuthorizationDecision => {
  return authorizeHubUpdate(actor, target, ['userRoles'])
}

export const authorizeHubPublish = (
  actor: HubAuthActor,
  target: Required<Pick<HubAuthTarget, 'resourceId' | 'resourceHubId'>>,
): AuthorizationDecision => {
  return authorizeHubUpdate(actor, target, ['isPublished'])
}

export const authorizeHubDelete = (
  actor: HubAuthActor,
  _target: Required<Pick<HubAuthTarget, 'resourceId' | 'resourceHubId'>>,
): AuthorizationDecision => {
  if (!hasAuthenticatedSession(actor)) {
    return { allowed: false, code: 'UNAUTHENTICATED' }
  }

  return isCoreHubAdmin(actor.userRoles)
    ? { allowed: true }
    : { allowed: false, code: 'HUB_SCOPE_FORBIDDEN' }
}

export const resolveHubActionPermissions = (
  actor: HubAuthActor,
  target: HubAuthTarget | null | undefined,
  fields: HubAuthorizationField[] = ['code'],
): HubActionPermissions => {
  const canCreate = authorizeHubCreate(actor, fields).allowed

  if (!target?.resourceId || target.resourceHubId === undefined) {
    return {
      canCreate,
      canEdit: false,
      canPublish: false,
      canDelete: false,
    }
  }

  const scopedTarget = {
    resourceId: target.resourceId,
    resourceHubId: target.resourceHubId,
  }

  return {
    canCreate,
    canEdit: authorizeHubUpdate(actor, scopedTarget, fields).allowed,
    canPublish: authorizeHubPublish(actor, scopedTarget).allowed,
    canDelete: authorizeHubDelete(actor, scopedTarget).allowed,
  }
}
