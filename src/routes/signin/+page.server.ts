// SVELTE
import { redirect } from '@sveltejs/kit'
// TYPES
import type { PageServerLoad } from './$types'

/**
 * Resolves a same-origin destination for a session that has already been created.
 *
 * @param url - The login request URL containing an optional return destination.
 * @returns A safe application-relative destination.
 */
function getReturnDestination(url: URL): string {
  const candidate = url.searchParams.get('returnTo')
  if (!candidate) return '/'

  try {
    const destination = new URL(candidate, url.origin)
    return destination.origin === url.origin &&
      destination.pathname !== '/signin' &&
      destination.pathname !== '/signup'
      ? `${destination.pathname}${destination.search}${destination.hash}`
      : '/'
  } catch {
    return '/'
  }
}

/**
 * Keeps signed-in account holders out of the sign-in screen.
 *
 * @param event - Request context with the session resolved in the auth hook.
 * @returns Never returns when an active session is present.
 * @remarks Guests remain on this page so they can upgrade or sign into an
 * existing account. The client-side guest action resumes their current session.
 */
export const load: PageServerLoad = ({ locals, url }) => {
  if (locals.session && locals.user && locals.user.isAnonymous !== true) {
    throw redirect(302, getReturnDestination(url))
  }
}
