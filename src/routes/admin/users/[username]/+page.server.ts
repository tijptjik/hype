// SVELTEKIT
import { error } from '@sveltejs/kit'
// AUTH
import { setupRequestHandler } from '#lib/api/index.js'
import { canReadAdminUserProfile } from '#lib/api/services/adminUser.js'
// TYPES
import type { PageServerLoad } from './$types'

/**
 * Checks admin profile access before rendering the shell.
 * @param event Current request with server-resolved session and bindings.
 * @returns Empty payload; profile data is loaded through the guarded remote.
 */
export const load: PageServerLoad = async event => {
  const { user, userRoles } = await setupRequestHandler({
    locals: event.locals,
    platform: event.locals.platform,
    request: event.request,
  })
  if (!canReadAdminUserProfile({ ...user, userRoles })) error(403, 'INSUFFICIENT_ROLE')
  return {}
}
