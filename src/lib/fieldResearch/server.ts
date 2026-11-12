// SVELTEKIT
import { error } from '@sveltejs/kit'
// API
import { getUserRoles } from '#lib/db/services/user.js'
import { requireResearchSessionAccess } from './access.js'
import { getSessionOrError, getDatabaseWithoutAuth } from '#lib/api/index.js'

/** Resolve a private research request; UI visibility never grants asset or mutation access.
 * @param locals Authenticated request locals.
 * @param sessionId Requested private session.
 * @returns Request-local database and authorized project manager.
 */
export async function researchRequest(locals: App.Locals, sessionId: string) {
  const { user } = await getSessionOrError(locals)
  if (user.isAnonymous) error(403, 'INSUFFICIENT_ROLE')
  const { db } = await getDatabaseWithoutAuth(locals.platform)
  const userRoles = user.superAdmin ? [] : await getUserRoles(db, user.id)
  await requireResearchSessionAccess({ db, user, userRoles }, sessionId)
  return { db, user }
}
