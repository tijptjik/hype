// SVELTEKIT
import { json } from '@sveltejs/kit'
// AUTH
import { hashFacebookDeletionConfirmationCode } from '$lib/auth/facebook-data-deletion'
// DB
import * as schema from '$lib/db/schema/index'
// DRIZZLE
import { and, eq, isNotNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
// TYPES
import type { RequestHandler } from './$types'

/**
 * Reports the completion status of a Facebook data deletion request.
 *
 * @param event - Request containing Meta's confirmation code.
 * @returns A public status response for Facebook's deletion workflow.
 */
export const GET: RequestHandler = async ({ url, platform }) => {
  const confirmationCode = url.searchParams.get('code')
  const database = platform?.env?.DB
  if (!confirmationCode || !database) {
    return json({ status: 'unknown', confirmation_code: confirmationCode })
  }

  const db = drizzle(database, { schema })
  const completedRequest = await db
    .select({
      confirmationCodeHash: schema.facebookDeletionRequest.confirmationCodeHash,
    })
    .from(schema.facebookDeletionRequest)
    .where(
      and(
        eq(
          schema.facebookDeletionRequest.confirmationCodeHash,
          await hashFacebookDeletionConfirmationCode(confirmationCode),
        ),
        isNotNull(schema.facebookDeletionRequest.completedAt),
      ),
    )
    .limit(1)

  return json({
    status: completedRequest.length ? 'completed' : 'unknown',
    confirmation_code: confirmationCode,
  })
}
