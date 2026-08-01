// SVELTEKIT
import { error, json } from '@sveltejs/kit'
// DB
import client from '$lib/db'
// AUTH
import { cleanupExpiredAnonymousUsers } from '$lib/auth/anonymous.server'
// TYPES
import type { RequestHandler } from './$types'
import type { D1Database as MiniflareD1Database } from '@miniflare/d1'

/**
 * Runs the scheduled guest-account retention cleanup.
 *
 * @param event - Authenticated maintenance request from the deployment scheduler.
 * @returns Aggregate cleanup result without deleted identifiers.
 * @remarks The bearer token is a dedicated secret and must not reuse Better Auth keys.
 */
export const POST: RequestHandler = async ({ request, platform }) => {
  const expectedToken = platform?.env?.ANONYMOUS_CLEANUP_TOKEN
  const suppliedToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

  if (!expectedToken || !suppliedToken || suppliedToken !== expectedToken) {
    throw error(401, 'UNAUTHENTICATED')
  }
  if (!platform?.env?.DB) throw error(500, 'Database not available')

  try {
    const db = client(platform.env.DB as unknown as MiniflareD1Database)
    const deletedCount = await cleanupExpiredAnonymousUsers(db)
    return json({ deletedCount })
  } catch (cause) {
    console.error('[auth][anonymous-cleanup]', { outcome: 'failed', cause })
    throw error(500, 'Anonymous cleanup failed')
  }
}
