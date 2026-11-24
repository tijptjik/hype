// ROLE HIERARCHY
import { isOrganisationStaffRole } from '#lib/roles/organisation.js'
import { canAccessAnalytics } from '#lib/api/services/authz/user.js'
// TYPES
import type { UserRoleDisco, SessionUser } from '#lib/types.js'

export function isSuperAdmin(user: SessionUser): boolean {
  return user.superAdmin || false
}

/**
 * Checks whether the user should see the admin analytics surface.
 */
export function canViewAnalytics(
  user: Pick<SessionUser, 'superAdmin' | 'roles'> | null,
): boolean {
  if (!user) return false

  return canAccessAnalytics({
    superAdmin: user.superAdmin,
    userRoles: user.roles ?? [],
  })
}

export const getOrganisationIdforRoles = (userRoles: UserRoleDisco[]) => {
  return userRoles
    .map((role: UserRoleDisco) =>
      role.type === 'organisation' && isOrganisationStaffRole(role.role)
        ? role.organisationId
        : null,
    )
    .filter(Boolean)
}
