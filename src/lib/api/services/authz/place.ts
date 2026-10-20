// AUTHORIZATION
import { isCoreHubAdmin } from './hub'
// TYPES
import type { UserRoleDisco } from '#lib/types.js'

/**
 * Restrict changes to shared Place identity to HYPE/core administrators.
 * @param actor Fresh account state and persisted role assignments.
 * @returns Whether the actor may review shared canonical identity bindings.
 * @remarks Non-core hub and project roles cannot change an identity shared across projects.
 * Private Place administration separately delegates to the owning organisation's management policy.
 */
export function canManageSharedPlaceIdentity(actor: {
  isAnonymous?: boolean | null
  userRoles: UserRoleDisco[]
}): boolean {
  return actor.isAnonymous !== true && isCoreHubAdmin(actor.userRoles)
}
