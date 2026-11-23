// SVELTEKIT
import { error } from '@sveltejs/kit'
// AUTH
import { getSessionOrError } from '#lib/api/index.js'
// TYPES
import type { PageServerLoad } from './$types'

/**
 * Restrict the field research portal to authenticated users; individual session and project APIs enforce management scope.
 * @param event Request context resolved by the authentication hook.
 * @returns Empty page data after authorization.
 */
export const load: PageServerLoad = async event => {
  const { user } = await getSessionOrError(event.locals)
  if (user.isAnonymous) error(403, 'INSUFFICIENT_ROLE')
  return {}
}
