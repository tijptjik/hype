import type { UserRoleDisco } from '$lib/types'

export type AuthenticatedSessionActor = {
  isAuthenticated?: boolean
  userId?: string | null
}

type UserSearchActor = {
  superAdmin?: boolean | null
  userRoles: UserRoleDisco[]
}

type UserUpdateActor = {
  isAuthenticated?: boolean
  userId?: string | null
  superAdmin?: boolean | null
}

/**
 * Admin panel visibility policy for the app-level menu.
 *
 * Allowed:
 * - super admins
 * - any user with at least one role that is not the baseline `user` role
 */
export const canAccessAdminPanel = (actor: UserSearchActor): boolean => {
  if (actor.superAdmin) return true
  return actor.userRoles.some(role => role.role !== 'user')
}

/**
 * Shared elevated access policy used by analytics and user-search admin surfaces.
 *
 * Allowed:
 * - super admins
 * - hub admins
 * - organisation owners
 * - project owners
 */
export const canAccessAnalytics = (actor: UserSearchActor): boolean => {
  if (actor.superAdmin) return true

  return actor.userRoles.some(role => {
    if (role.type === 'hub') return role.role === 'admin'
    if (role.type === 'organisation') return role.role === 'owner'
    if (role.type === 'project') return role.role === 'owner'
    return false
  })
}

/**
 * Search-users endpoint access policy.
 *
 * Allowed:
 * - super admins
 * - hub admins
 * - organisation owners
 * - project owners
 */
export const canSearchUsers = (actor: UserSearchActor): boolean =>
  canAccessAnalytics(actor)

/**
 * Archived visibility override policy for user search.
 *
 * Only super admins and hub admins may explicitly override `isArchived`.
 */
export const canOverrideUserSearchArchivedFilter = (
  actor: UserSearchActor,
): boolean => {
  if (actor.superAdmin) return true
  return actor.userRoles.some(role => role.type === 'hub' && role.role === 'admin')
}

/**
 * User self-profile update policy.
 *
 * Allowed:
 * - the authenticated user updating their own record
 * - super admins updating any user record
 */
export const canUpdateUserProfile = (
  actor: UserUpdateActor,
  targetUserId: string,
): boolean => {
  if (!hasAuthenticatedSession(actor)) return false
  if (actor.superAdmin) return true
  return actor.userId === targetUserId
}

export const hasAuthenticatedSession = (actor: AuthenticatedSessionActor): boolean => {
  if (actor.isAuthenticated !== undefined) return actor.isAuthenticated
  return Boolean(actor.userId)
}
