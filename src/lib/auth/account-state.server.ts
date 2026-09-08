// AUTH
import { APIError } from 'better-auth/api'
// DB
import { eq } from 'drizzle-orm'
import { user } from '$lib/db/schema'
// TYPES
import type { Database } from '$lib/types'

/**
 * Requires a currently available account before creating or using an auth session.
 * @param db - Authoritative account database.
 * @param userId - User identified by a validated session or sign-in flow.
 * @returns Nothing when the account exists and is not archived.
 * @remarks Guests remain eligible. Never trust a signed session's cached archive flag;
 * missing and archived accounts receive the same denial without exposing account details.
 */
export async function requireAvailableAuthUser(
  db: Database,
  userId: string,
): Promise<void> {
  const current = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { isArchived: true },
  })
  if (!current || current.isArchived) {
    throw new APIError('UNAUTHORIZED', {
      code: 'ACCOUNT_UNAVAILABLE',
      message: 'Account unavailable',
    })
  }
}
