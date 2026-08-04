// SVELTEKIT
import { error, json } from '@sveltejs/kit'
// AUTH
import {
  createFacebookDeletionConfirmationCode,
  hashFacebookDeletionConfirmationCode,
  parseFacebookSignedRequest,
} from '$lib/auth/facebook-data-deletion'
// DB
import * as schema from '$lib/db/schema/index'
// DRIZZLE
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
// TYPES
import type { RequestHandler } from './$types'

/**
 * Handles Meta's Facebook user data deletion callback.
 *
 * @param event - Incoming Facebook callback request.
 * @returns Meta-compatible deletion confirmation response.
 * @remarks Facebook sends a signed request containing its app-scoped user ID.
 * HYPE removes the matching account and authentication records while retaining
 * submitted public content in anonymized form where the database permits it.
 */
export const POST: RequestHandler = async ({ request, url, platform }) => {
  const appSecret = platform?.env?.AUTH_FACEBOOK_SECRET
  const database = platform?.env?.DB
  if (!appSecret || !database) throw error(503, 'FACEBOOK_DELETION_UNAVAILABLE')

  const form = await request.formData()
  const signedRequest = form.get('signed_request')
  if (typeof signedRequest !== 'string') throw error(400, 'INVALID_SIGNED_REQUEST')

  const payload = await parseFacebookSignedRequest(signedRequest, appSecret)
  if (!payload) throw error(400, 'INVALID_SIGNED_REQUEST')

  const db = drizzle(database, { schema })
  const matchingAccount = await db
    .select({ userId: schema.account.userId })
    .from(schema.account)
    .where(
      and(
        eq(schema.account.providerId, 'facebook'),
        eq(schema.account.accountId, payload.user_id),
      ),
    )
    .limit(1)

  if (matchingAccount[0]?.userId) {
    // Deleting the user lets the declared foreign-key actions remove auth and
    // per-user state while anonymizing user references on submitted content.
    await db.delete(schema.user).where(eq(schema.user.id, matchingAccount[0].userId))
  }

  const confirmationCode = await createFacebookDeletionConfirmationCode(
    appSecret,
    payload.user_id,
  )
  await db
    .insert(schema.facebookDeletionRequest)
    .values({
      confirmationCodeHash:
        await hashFacebookDeletionConfirmationCode(confirmationCode),
    })
    .onConflictDoNothing()

  return json({
    url: `${url.origin}/api/auth/facebook/data-deletion/status?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  })
}
