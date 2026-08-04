// SVELTE
import { error, json } from '@sveltejs/kit'
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
 * Converts a guest into a durable account after it has registered a passkey.
 *
 * @param event - Same-origin request carrying the current Better Auth session.
 * @returns A success marker after a registered passkey has promoted the account.
 * @remarks The client cannot promote a guest directly: this route confirms the
 * passkey record server-side before removing the anonymous-account marker.
 */
export const POST: RequestHandler = async ({ request, url, locals, platform }) => {
  const origin = request.headers.get('origin')
  if (!origin || origin !== url.origin) throw error(403, 'FORBIDDEN')
  if (!locals.session || !locals.user) throw error(401, 'UNAUTHENTICATED')
  if (locals.user.isAnonymous !== true) return json({ status: true })
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

  // Better Auth rewrites the signed cookie cache with the updated user data.
  return locals.auth.api.updateUser({
    body: { isAnonymous: false },
    headers: request.headers,
    asResponse: true,
  })
}
