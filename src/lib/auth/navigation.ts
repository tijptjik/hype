// SVELTEKIT
import { goto } from '$app/navigation'
// AUTH
import { toSafeReturnPath } from './upgrade.js'

/**
 * Resumes an application route after authentication, falling back to the map.
 *
 * @param candidate - Untrusted return URL from query state or account-upgrade intent.
 * @returns Resolves when the return route or the home fallback finishes navigating.
 * @remarks Same-origin URLs can still name missing routes, which Kit 3 rejects.
 */
export async function navigateAfterAuth(candidate?: string | null): Promise<void> {
  const destination = toSafeReturnPath(candidate)
  try {
    await goto(destination)
  } catch (error) {
    // A stale return URL must not turn a successful sign-in into an auth error.
    if (destination === '/') throw error
    await goto('/')
  }
}
