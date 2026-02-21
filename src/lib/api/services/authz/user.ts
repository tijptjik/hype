import type { UserRoleDisco } from '$lib/types'

type UserSearchActor = {
  superAdmin?: boolean | null
  userRoles: UserRoleDisco[]
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
export const canSearchUsers = (actor: UserSearchActor): boolean => {
  if (actor.superAdmin) return true

  return actor.userRoles.some(role => {
    if (role.type === 'hub') return role.role === 'admin'
    if (role.type === 'organisation') return role.role === 'owner'
    if (role.type === 'project') return role.role === 'owner'
    return false
  })
}

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
