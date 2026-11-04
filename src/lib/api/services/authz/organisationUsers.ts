// AUTHORIZATION
import { isRelevantHubAdmin } from './hub'
// TYPES
import type { UserRoleDisco } from '#lib/types.js'

/**
 * Authorize organisation audience administration independently of audience membership.
 * @param actor Authenticated server identity and resolved staff roles.
 * @param target Persisted organisation and hub scope.
 * @returns Whether policy and scoped user/contact reads are allowed.
 * @remarks Ordinary members and organisation users do not receive directory access.
 */
export function canManageOrganisationUsers(
  actor: {
    id?: string
    isAnonymous?: boolean | null
    superAdmin?: boolean | null
    roles: UserRoleDisco[]
  },
  target: { id: string; hubId: string | null; isArchived?: boolean },
): boolean {
  return Boolean(
    actor.id &&
      actor.isAnonymous === false &&
      !target.isArchived &&
      (actor.superAdmin ||
        isRelevantHubAdmin(actor.roles, target.hubId) ||
        actor.roles.some(
          role =>
            role.type === 'organisation' &&
            role.organisationId === target.id &&
            role.role === 'owner',
        )),
  )
}
