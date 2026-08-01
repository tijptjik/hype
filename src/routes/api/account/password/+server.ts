// SVELTEKIT
import { error, json } from '@sveltejs/kit'
// TYPES
import type { RequestHandler } from './$types'

/**
 * Adds the first email/password credential to an upgraded social-login account.
 *
 * @param event - Same-origin request carrying the current Better Auth session.
 * @returns A success marker after Better Auth creates the credential account.
 * @remarks Existing passwords cannot be replaced through this endpoint; Better Auth's
 * server-only `setPassword` API rejects accounts that already have a credential.
 */
export const POST: RequestHandler = async ({ request, url, locals }) => {
  const origin = request.headers.get('origin')
  if (!origin || origin !== url.origin) throw error(403, 'FORBIDDEN')
  if (!locals.session || !locals.user) throw error(401, 'UNAUTHENTICATED')
  if (locals.user.isAnonymous === true) throw error(403, 'ACCOUNT_REQUIRED')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw error(400, 'INVALID_REQUEST')
  }

  const newPassword =
    typeof body === 'object' && body !== null && 'newPassword' in body
      ? (body as { newPassword?: unknown }).newPassword
      : undefined
  if (typeof newPassword !== 'string') throw error(400, 'INVALID_REQUEST')

  try {
    await locals.auth.api.setPassword({
      body: { newPassword },
      headers: request.headers,
    })
    return json({ status: true })
  } catch (cause) {
    console.warn('[auth][set-password]', {
      outcome: 'rejected',
      userId: locals.user.id,
      cause,
    })
    throw error(400, 'PASSWORD_NOT_SET')
  }
}
