// SVELTE
import { error, fail, redirect } from '@sveltejs/kit'
// AUTH
import { completeBreadlinePhone } from '#lib/auth/breadline-phone.server.js'
// VALIDATION
import { normalizeTelephone } from '#lib/utils/telephone.js'
// TYPES
import type { Actions, PageServerLoad, RequestEvent } from './$types'

// +++ Table Of Contents
// 1. RETURN DESTINATION
// 2. PAGE AND COMPLETION ACTION
// ---

/**
 * Resolve a safe application destination after completion.
 * @param url Completion URL containing an optional return destination.
 * @returns A same-origin application path, excluding this form and auth callbacks.
 */
function returnDestination(url: URL): string {
  let candidate: URL
  try {
    candidate = new URL(url.searchParams.get('returnTo') || '/', url.origin)
  } catch {
    return '/'
  }
  return candidate.origin === url.origin &&
    candidate.pathname !== '/account/phone' &&
    !candidate.pathname.startsWith('/api/auth/')
    ? `${candidate.pathname}${candidate.search}${candidate.hash}`
    : '/'
}

/**
 * Load the signed-in account's persisted phone completion status.
 * @param event Server request with the authenticated account and database.
 * @returns Empty form data, or redirects when completion is unnecessary.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.session || !locals.user || locals.user.isAnonymous)
    redirect(303, '/signin')
  if (locals.hub?.code !== 'breadline') redirect(303, '/')
  const current = await locals.platform.env.DB.prepare(
    'SELECT telephone FROM user WHERE id = ? AND isArchived = 0 AND isAnonymous = 0',
  )
    .bind(locals.user.id)
    .first<{ telephone: string | null }>()
  if (!current) error(401, 'Account unavailable')
  if (normalizeTelephone(current.telephone)) redirect(303, returnDestination(url))
  return {}
}

/**
 * Complete only the session owner's phone and resume the original application path.
 * @param event Same-origin SvelteKit form action with the authenticated account.
 * @returns Field feedback for invalid/duplicate phones, or redirects on success.
 * @remarks SvelteKit enforces form origin checks. Submitted account IDs are ignored.
 */
async function completePhone({
  locals,
  request,
  url,
}: RequestEvent): Promise<
  ReturnType<typeof fail<{ problem: 'invalid' | 'in-use'; telephone: string }>>
> {
  if (!locals.session || !locals.user || locals.user.isAnonymous)
    error(401, 'Sign in required')
  if (locals.hub?.code !== 'breadline') error(403, 'Breadline hub required')
  const form = await request.formData()
  const value = form.get('telephone')
  const telephone = typeof value === 'string' ? value : ''
  const result = await completeBreadlinePhone(
    locals.platform.env.DB,
    locals.user.id,
    telephone,
  )
  if (result === 'unavailable') error(401, 'Account unavailable')
  if (result !== 'saved')
    return fail(result === 'invalid' ? 400 : 409, { problem: result, telephone })
  redirect(303, returnDestination(url))
}

export const actions: Actions = { default: completePhone }
