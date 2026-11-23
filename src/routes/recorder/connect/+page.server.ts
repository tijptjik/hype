// SVELTE
import { error, redirect } from '@sveltejs/kit'
// TYPES
import type { PageServerLoad } from './$types'

/**
 * Requires a durable HYPE account before the contributor reviews a pairing code.
 * @param event - The incoming browser request.
 * @returns The code printed in Recorder.
 */
export const load: PageServerLoad = ({ locals, url, setHeaders }) => {
  setHeaders({ 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' })
  const code = url.searchParams.get('user_code')
  if (!code || !/^[a-zA-Z0-9-]{8,12}$/.test(code)) error(400, 'Invalid Recorder code')
  if (!locals.user || locals.user.isAnonymous) {
    redirect(303, '/signin?returnTo=' + encodeURIComponent(url.pathname + url.search))
  }
  return { code, name: locals.user.name || locals.user.id }
}
