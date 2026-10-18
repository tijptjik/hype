// SVELTEKIT
import { error } from '@sveltejs/kit'
// AUTH
import { setupRequestHandler } from '#lib/api/index.js'
import { canBrowseUsers } from '#lib/api/services/authz/userDirectory.js'
// TYPES
import type { PageServerLoad } from './$types'

/**
 * Authorizes the directory before rendering; records are loaded by the search remote.
 * @param event Current request, including the resolved hub and session.
 * @returns An empty page payload after authorization.
 */
export const load: PageServerLoad = async event => {
  const { user, userRoles } = await setupRequestHandler({
    locals: event.locals,
    platform: event.locals.platform,
    request: event.request,
  })
  if (
    !canBrowseUsers({
      isAnonymous: user.isAnonymous,
      superAdmin: user.superAdmin,
      userRoles,
      hubId: event.locals.hub?.id,
    })
  )
    error(403, 'INSUFFICIENT_ROLE')
  return {}
}
