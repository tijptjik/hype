// AUTH
import { isRelevantHubAdmin } from '#lib/api/services/authz/hub.js'
// TYPES
import type { UserRoleDisco } from '#lib/types.js'

/** Persisted scope of a resource being previewed. */
export type PublicationTarget = {
  organisationId: string
  projectId?: string | null
  hubId?: string | null
}

/**
 * Checks the existing editing roles that implicitly permit publication preview.
 * @param user Current authenticated account; anonymous sessions never qualify.
 * @param roles Authoritative role assignments.
 * @param target Persisted resource ancestry, never a caller-supplied authorization scope.
 * @returns Whether the actor manages the target's entire publication scope.
 * @remarks Organisation ownership is inherited. Project membership and translation
 * roles do not permit preview; project roles never grant upward organisation access.
 */
export function canPreviewPublication(
  user: {
    id?: string | null
    isAnonymous?: boolean | null
    superAdmin?: boolean | null
  },
  roles: UserRoleDisco[],
  target: PublicationTarget,
): boolean {
  if (!user.id || user.isAnonymous) return false
  return (
    Boolean(user.superAdmin) ||
    isRelevantHubAdmin(roles, target.hubId) ||
    roles.some(
      role =>
        (role.type === 'organisation' &&
          role.organisationId === target.organisationId &&
          role.role === 'owner') ||
        (role.type === 'project' &&
          role.projectId === target.projectId &&
          (role.role === 'owner' || role.role === 'maintainer')),
    )
  )
}
