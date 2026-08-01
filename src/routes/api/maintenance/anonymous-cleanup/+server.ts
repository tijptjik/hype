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
 * Compares secret strings without an early-returning character comparison.
 *
 * @param supplied - Credential provided by the scheduler.
 * @param expected - Credential stored on the application Worker.
 * @returns Whether the SHA-256 digests match.
 */
async function secretsMatch(supplied: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [suppliedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(supplied)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  const suppliedBytes = new Uint8Array(suppliedDigest)
  const expectedBytes = new Uint8Array(expectedDigest)
  let difference = 0

  for (let index = 0; index < suppliedBytes.length; index += 1) {
    difference |= suppliedBytes[index] ^ expectedBytes[index]
  }
  return difference === 0
}

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

  if (
    !expectedToken ||
    !suppliedToken ||
    !(await secretsMatch(suppliedToken, expectedToken))
  ) {
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
