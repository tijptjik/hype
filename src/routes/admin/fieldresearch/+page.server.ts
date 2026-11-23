// SVELTEKIT
import { error, redirect } from '@sveltejs/kit'
// AUTH
import { getSessionOrError } from '#lib/api/index.js'
// TYPES
import type { PageServerLoad } from './$types'

/**
 * Restrict the field research portal to authenticated users; individual session and project APIs enforce management scope.
 * @param event Request context resolved by the authentication hook.
 * @returns Redirects authorized users to Field Sessions.
 * @remarks The Field Entries page is maintained on its dedicated branch.
 */
export const load: PageServerLoad = async event => {
  const { user } = await getSessionOrError(event.locals)
  if (user.isAnonymous) error(403, 'INSUFFICIENT_ROLE')
  redirect(307, '/admin/field-recorder')
}
