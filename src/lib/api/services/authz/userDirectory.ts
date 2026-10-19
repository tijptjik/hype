// AUTH
import { isCoreHubAdmin, isRelevantHubAdmin } from './hub'
// TYPES
import type { UserRoleDisco } from '#lib/types.js'

/**
 * Restricts the user directory to administrators of the active hub.
 * @param actor Session identity, resolved roles, and the active hub.
 * @returns Whether the directory may be shown and loaded.
 * @remarks Core hub administrators retain their global access.
 */
export function canBrowseUsers(actor: {
  isAnonymous?: boolean | null
  superAdmin?: boolean | null
  userRoles: UserRoleDisco[]
  hubId?: string | null
}): boolean {
  return (
    actor.isAnonymous !== true &&
    (actor.superAdmin === true || isRelevantHubAdmin(actor.userRoles, actor.hubId))
  )
}

/**
 * Grants unrestricted user contact visibility only to HYPE/core administrators.
 * @param actor Fresh session identity and resolved roles.
 * @returns Whether both email and telephone may be disclosed globally.
 * @remarks Other hub admins await hub-specific interaction/onboarding rules.
 */
export function canReadAllUserContacts(actor: {
  isAnonymous?: boolean | null
  superAdmin?: boolean | null
  userRoles: UserRoleDisco[]
}): boolean {
  return (
    actor.isAnonymous !== true &&
    (actor.superAdmin === true || isCoreHubAdmin(actor.userRoles))
  )
}
