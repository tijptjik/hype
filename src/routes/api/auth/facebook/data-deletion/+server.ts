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

  if (matchingAccount) {
    await db.transaction(async tx => {
      const [linkedAccounts, registeredPasskey, existingUser] = await Promise.all([
        tx.query.account.findMany({
          where: eq(schema.account.userId, matchingAccount.userId),
          columns: { id: true },
        }),
        tx.query.passkey.findFirst({
          where: eq(schema.passkey.userId, matchingAccount.userId),
          columns: { id: true },
        }),
        tx.query.user.findFirst({
          where: eq(schema.user.id, matchingAccount.userId),
          columns: { id: true },
        }),
      ])

      // Remove Facebook's token-bearing association before retaining any account state.
      await tx.delete(schema.account).where(eq(schema.account.id, matchingAccount.id))

      const hasAnotherSignInMethod =
        linkedAccounts.some(account => account.id !== matchingAccount.id) ||
        Boolean(registeredPasskey)
      if (hasAnotherSignInMethod || !existingUser) return

      // Keep the immutable user ID for submitted records, but scrub private account state.
      const deletedUsername = await createDeletedUsername(
        matchingAccount.userId,
        username =>
          tx.query.user.findFirst({
            where: eq(schema.user.username, username),
            columns: { id: true },
          }),
      )
      await Promise.all([
        tx
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
          .where(eq(schema.user.id, matchingAccount.userId)),
        tx
          .delete(schema.session)
          .where(eq(schema.session.userId, matchingAccount.userId)),
        tx
          .delete(schema.passkey)
          .where(eq(schema.passkey.userId, matchingAccount.userId)),
        tx
          .delete(schema.verification)
          .where(eq(schema.verification.value, matchingAccount.userId)),
        tx
          .delete(schema.userActivity)
          .where(eq(schema.userActivity.userId, matchingAccount.userId)),
        tx
          .delete(schema.userFeature)
          .where(eq(schema.userFeature.userId, matchingAccount.userId)),
        tx
          .delete(schema.userLayer)
          .where(eq(schema.userLayer.userId, matchingAccount.userId)),
        tx
          .delete(schema.hubRole)
          .where(eq(schema.hubRole.userId, matchingAccount.userId)),
        tx
          .delete(schema.hubUserState)
          .where(eq(schema.hubUserState.userId, matchingAccount.userId)),
        tx
          .delete(schema.organisationRole)
          .where(eq(schema.organisationRole.userId, matchingAccount.userId)),
        tx
          .delete(schema.projectRole)
          .where(eq(schema.projectRole.userId, matchingAccount.userId)),
      ])
    })
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

/**
 * Creates an available tombstone username while retaining the app's generated-name style.
 *
 * @param userId - Stable internal user identifier retained for public contributions.
 * @param findUserByUsername - Looks up an existing username inside the active transaction.
 * @returns A valid, deterministic username not used by another user.
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
