// API
import { isRelevantHubAdmin } from './hub'
// TYPES
import type { UserRoleDisco } from '#lib/types.js'

/**
 * Check private inbox and account-management access without broadening organisation edits.
 * @param actor Authenticated server identity and resource-scoped roles.
 * @param target The organisation loaded from the database.
 * @returns Whether this actor is a member/owner, relevant hub admin, or superadmin.
 */
export function canManageOrganisationMessaging(
  actor: { id?: string | null; isAnonymous?: boolean; superAdmin?: boolean; roles: UserRoleDisco[] },
  target: { id: string; hubId: string | null; isArchived?: boolean },
): boolean {
  if (!actor.id || actor.isAnonymous !== false || target.isArchived) return false
  return actor.superAdmin === true || isRelevantHubAdmin(actor.roles, target.hubId) || actor.roles.some(
    role => role.type === 'organisation' && role.organisationId === target.id && (role.role === 'member' || role.role === 'owner'),
  )
}
