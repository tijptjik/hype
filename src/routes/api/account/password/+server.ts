// SVELTE
import { error } from '@sveltejs/kit'
// TYPES
import type { RequestHandler } from './$types'

/**
 * Adds the first email/password credential to an upgraded social-login account.
 *
 * @param event - Same-origin request carrying the current Better Auth session.
 * @returns The rate-limited setup response, including any refreshed session cookies.
 * @remarks Existing passwords cannot be replaced. Use the HTTP handler so the
 * limiter runs before email changes or password hashing, never auth.api directly.
 */
export const POST: RequestHandler = async ({ request, url, locals }) => {
  const origin = request.headers.get('origin')
  if (!origin || origin !== url.origin) throw error(403, 'FORBIDDEN')
  if (!locals.session || !locals.user) throw error(401, 'UNAUTHENTICATED')
  if (locals.user.isAnonymous === true) throw error(403, 'ACCOUNT_REQUIRED')

  // Preserve the original headers (including trusted client IP) and response cookies.
  return locals.auth.handler(
    new Request(new URL('/api/auth/account-password', url), request),
  )
}
