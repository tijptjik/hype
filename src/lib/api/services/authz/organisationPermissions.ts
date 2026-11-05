// TYPES
import type { SessionUser } from '#lib/types.js'

/**
 * Protect the platform-granted permission independently of organisation ownership.
 * @param actor Authenticated session identity.
 * @param submitted Optional flag from the organisation form.
 * @param current Persisted flag; new organisations default to false.
 * @returns Whether the submission leaves the grant unchanged or has SuperAdmin authority.
 * @remarks Role capabilities and core/scoped Hub Admin roles cannot grant this permission.
 */
export function canSubmitOrganisationUserDetailsPermission(
  actor: Pick<SessionUser, 'id' | 'isAnonymous' | 'superAdmin'>,
  submitted: boolean | undefined,
  current = false,
): boolean {
  if (!actor.id || actor.isAnonymous !== false) return false
  return submitted === undefined || submitted === current || actor.superAdmin === true
}
