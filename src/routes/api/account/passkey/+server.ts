// SVELTEKIT
import { error, json } from '@sveltejs/kit'
// DB
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { passkey, user } from '$lib/db/schema'
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

  const db = drizzle(platform.env.DB, { schema: { passkey, user } })
  const registeredPasskey = await db.query.passkey.findFirst({
    where: eq(passkey.userId, locals.user.id),
    columns: { id: true },
  })
  if (!registeredPasskey) throw error(400, 'PASSKEY_REQUIRED')

  // A passkey is the guest's durable authentication method from this point onward.
  await db.update(user).set({ isAnonymous: false }).where(eq(user.id, locals.user.id))

  return json({ status: true })
}
