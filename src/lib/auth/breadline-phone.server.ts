// SVELTE
import { redirect } from '@sveltejs/kit'
import type { Handle } from '@sveltejs/kit/hooks'
// VALIDATION
import { normalizeTelephone } from '#lib/utils/telephone.js'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'

// +++ Table Of Contents
// 1. PHONE COMPLETION
// 2. BREADLINE ACCESS GATE
// ---

export type PhoneCompletionResult = 'saved' | 'invalid' | 'in-use' | 'unavailable'

/**
 * Store a valid phone for the authenticated account without claiming another phone's history.
 * @param db Authoritative account database.
 * @param userId Account identified by the server session, never a submitted user ID.
 * @param input Submitted phone text.
 * @returns The completion outcome; collisions leave both accounts unchanged.
 * @remarks The unique user phone index arbitrates concurrent submissions. Source
 * import ownership remains provenance and is not rewritten during phone completion.
 */
export async function completeBreadlinePhone(
  db: D1Database,
  userId: string,
  input: string,
): Promise<PhoneCompletionResult> {
  const telephone = normalizeTelephone(input)
  if (!telephone) return 'invalid'
  try {
    const result = await db
      .prepare(`UPDATE user SET telephone = ?, updatedAt = ?
      WHERE id = ? AND isAnonymous = 0 AND isArchived = 0`)
      .bind(telephone, Date.now(), userId)
      .run()
    return result.meta.changes === 1 ? 'saved' : 'unavailable'
  } catch (error) {
    // A duplicate phone requires account reconciliation, never an implicit ownership transfer.
    if (String(error).includes('UNIQUE constraint failed: user.telephone'))
      return 'in-use'
    throw error
  }
}

/**
 * Require phone completion for signed-in Breadline accounts before application access.
 * @param input SvelteKit request and continuation after authoritative session resolution.
 * @returns A redirect for navigation, a structured denial for API/data requests, or the application.
 * @remarks This applies to all durable accounts, including new social logins. It
 * reads the current database phone rather than a potentially stale session profile.
 * Authentication, legal pages, static assets and the completion form remain reachable.
 */
export const handleBreadlinePhone: Handle = async ({ event, resolve }) => {
  const { locals, url, request } = event
  const path = url.pathname
  if (
    locals.hub?.code !== 'breadline' ||
    !locals.session ||
    !locals.user ||
    locals.user.isAnonymous === true ||
    path === '/account/phone' ||
    path.startsWith('/api/auth/') ||
    path.startsWith('/policy/') ||
    path.startsWith('/_app/immutable/') ||
    path.startsWith('/static/')
  )
    return resolve(event)

  // Gate both page loads and direct API/remote calls using the persisted account state.
  const current = await locals.platform.env.DB.prepare(
    'SELECT telephone FROM user WHERE id = ? AND isArchived = 0 AND isAnonymous = 0',
  )
    .bind(locals.user.id)
    .first<{ telephone: string | null }>()
  if (current && normalizeTelephone(current.telephone)) return resolve(event)

  const destination = new URL('/account/phone', url)
  destination.searchParams.set('returnTo', `${path}${url.search}`)
  if (import.meta.env.DEV && url.searchParams.get('hub') === 'breadline')
    destination.searchParams.set('hub', 'breadline')
  const location = destination.pathname + destination.search
  if (
    request.method === 'GET' &&
    !path.startsWith('/api/') &&
    (event.isDataRequest || request.headers.get('accept')?.includes('text/html'))
  )
    redirect(303, location)
  return Response.json(
    { code: 'BREADLINE_PHONE_REQUIRED', location },
    {
      status: 403,
      headers: { 'cache-control': 'no-store' },
    },
  )
}
