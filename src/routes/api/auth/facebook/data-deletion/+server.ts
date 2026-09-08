// SVELTEKIT
import { error, json } from '@sveltejs/kit'
// AUTH
import {
  createFacebookDeletionConfirmationCode,
  hashFacebookDeletionConfirmationCode,
  parseFacebookSignedRequest,
} from '$lib/auth/facebook-data-deletion'
import { generateUsernameFromId } from '$lib/utils/username-generator.server'
// DB
import * as schema from '$lib/db/schema/index'
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
// TYPES
import type { RequestHandler } from './$types'

/**
 * Handles Meta's Facebook user data deletion callback.
 *
 * @param event - Incoming Facebook callback request.
 * @returns Meta-compatible deletion confirmation response.
 * @remarks Facebook sends a signed request containing its app-scoped user ID.
 * HYPE never deletes the matching user row: it unlinks Facebook when another
 * sign-in method remains, or anonymizes and archives the otherwise inaccessible
 * account while retaining submitted public content.
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
  const matchingAccount = await db.query.account.findFirst({
    where: and(
      eq(schema.account.providerId, 'facebook'),
      eq(schema.account.accountId, payload.user_id),
    ),
    columns: { id: true, userId: true },
  })

  const confirmationCode = await createFacebookDeletionConfirmationCode(
    appSecret,
    payload.user_id,
  )
  const confirmation = db
    .insert(schema.facebookDeletionRequest)
    .values({
      confirmationCodeHash:
        await hashFacebookDeletionConfirmationCode(confirmationCode),
    })
    .onConflictDoNothing()

  if (matchingAccount) {
    // Recheck identity and credentials at write time, including stale callback retries.
    const matchingLink = and(
      eq(schema.account.id, matchingAccount.id),
      eq(schema.account.userId, matchingAccount.userId),
      eq(schema.account.providerId, 'facebook'),
      eq(schema.account.accountId, payload.user_id),
    )
    const canAnonymize = sql`exists (
        select 1 from ${schema.account} where ${matchingLink}
      ) and not exists (
        select 1 from ${schema.account}
        where ${schema.account.userId} = ${matchingAccount.userId}
          and ${schema.account.id} <> ${matchingAccount.id}
      ) and not exists (
        select 1 from ${schema.passkey}
        where ${schema.passkey.userId} = ${matchingAccount.userId}
      )`

    // Keep the immutable user ID for submitted records, but scrub private account state.
    const deletedUsername = await createDeletedUsername(
      matchingAccount.userId,
      username =>
        db.query.user.findFirst({
          where: eq(schema.user.username, username),
          columns: { id: true },
        }),
    )
    // D1 batches are atomic; keep the link until all guarded cleanup is complete.
    await db.batch([
      db
        .update(schema.user)
        .set({
          name: 'Deleted User',
          username: deletedUsername,
          email: `deleted+${matchingAccount.userId}@hype.invalid`,
          emailVerified: false,
          image: null,
          locale: 'en',
          attribution: null,
          isAnonymous: false,
          isArchived: true,
          preferences:
            '{"fallbackLocales":[], "allowMachineTranslation":false, "preferFallbackInCurrentLocale":false, "isTranslateButtonVisible":true}',
          experimental: '{"contributorMode":false, "noLabelsMode":false}',
        })
        .where(and(eq(schema.user.id, matchingAccount.userId), canAnonymize)),
      db
        .delete(schema.session)
        .where(and(eq(schema.session.userId, matchingAccount.userId), canAnonymize)),
      db
        .delete(schema.passkey)
        .where(and(eq(schema.passkey.userId, matchingAccount.userId), canAnonymize)),
      db
        .delete(schema.verification)
        .where(
          and(eq(schema.verification.value, matchingAccount.userId), canAnonymize),
        ),
      db
        .delete(schema.userActivity)
        .where(
          and(eq(schema.userActivity.userId, matchingAccount.userId), canAnonymize),
        ),
      db
        .delete(schema.userFeature)
        .where(
          and(eq(schema.userFeature.userId, matchingAccount.userId), canAnonymize),
        ),
      db
        .delete(schema.userLayer)
        .where(and(eq(schema.userLayer.userId, matchingAccount.userId), canAnonymize)),
      db
        .delete(schema.hubRole)
        .where(and(eq(schema.hubRole.userId, matchingAccount.userId), canAnonymize)),
      db
        .delete(schema.hubUserState)
        .where(
          and(eq(schema.hubUserState.userId, matchingAccount.userId), canAnonymize),
        ),
      db
        .delete(schema.organisationRole)
        .where(
          and(eq(schema.organisationRole.userId, matchingAccount.userId), canAnonymize),
        ),
      db
        .delete(schema.projectRole)
        .where(
          and(eq(schema.projectRole.userId, matchingAccount.userId), canAnonymize),
        ),
      db.delete(schema.account).where(matchingLink),
      confirmation,
    ])
  } else {
    await confirmation
  }

  return json({
    url: `${url.origin}/api/auth/facebook/data-deletion/status?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  })
}

/**
 * Creates an available tombstone username while retaining the app's generated-name style.
 *
 * @param userId - Stable internal user identifier retained for public contributions.
 * @param findUserByUsername - Looks up a candidate username before the atomic batch.
 * @returns A valid, deterministic username not used by another user.
 * @remarks A concurrent username collision fails and rolls back the entire batch.
 */
async function createDeletedUsername(
  userId: string,
  findUserByUsername: (username: string) => Promise<{ id: string } | undefined>,
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const username = generateUsernameFromId(`deleted:${userId}:${attempt}`)
    const existingUser = await findUserByUsername(username)
    if (!existingUser || existingUser.id === userId) return username
  }

  throw error(503, 'FACEBOOK_DELETION_UNAVAILABLE')
}
