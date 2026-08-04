// SVELTE
import { error } from '@sveltejs/kit'
// DRIZZLE
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
// DB
import { passkey } from '$lib/db/schema'
// AUTH
import { createAuthDiagnosticId } from '$lib/auth/diagnostics.server'
// TYPES
import type { RequestHandler } from './$types'

/**
 * Refreshes the signed session cache after passkey registration has promoted a guest.
 *
 * @param event - Same-origin request carrying the current Better Auth session.
 * @returns The authenticated session response with its cookie cache refreshed.
 * @remarks The passkey database trigger promotes the account atomically with credential
 * insertion. This route only confirms that credential before re-reading the authoritative
 * session. It must not update the user again: the request's cookie can still contain the
 * pre-promotion anonymous user.
 */
export const POST: RequestHandler = async ({ request, url, locals, platform }) => {
  const origin = request.headers.get('origin')
  if (!origin || origin !== url.origin) throw error(403, 'FORBIDDEN')
  if (!locals.session || !locals.user) throw error(401, 'UNAUTHENTICATED')
  if (!platform?.env?.DB) throw error(500, 'DATABASE_UNAVAILABLE')

  const db = drizzle(platform.env.DB, { schema: { passkey } })
  const userIdHash = await createAuthDiagnosticId(locals.user.id)
  const registeredPasskey = await db.query.passkey.findFirst({
    where: eq(passkey.userId, locals.user.id),
    columns: { id: true },
  })
  if (!registeredPasskey) {
    console.warn({
      event: 'auth.passkey.promotion',
      outcome: 'passkey-not-found',
      origin,
      host: url.hostname,
      userIdHash,
    })
    throw error(400, 'PASSKEY_REQUIRED')
  }

  console.info({
    event: 'auth.passkey.promotion',
    outcome: 'passkey-found',
    origin,
    host: url.hostname,
    userIdHash,
  })

  // Bypass the pre-promotion session-data cookie and write a cache from the database record.
  return locals.auth.api.getSession({
    headers: request.headers,
    asResponse: true,
    query: { disableCookieCache: true },
  })
}
