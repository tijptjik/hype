import { browser } from '$app/environment'

export const UPGRADE_ACCOUNT_EVENT = 'hype:upgrade-account'

export type UpgradeReason =
  | 'account'
  | 'admin'
  | 'contribution'
  | 'profile'
  | 'subscription'
  | 'sync'

/**
 * Determines whether a user represents an anonymous guest session.
 *
 * @param user - Optional user state from a session or application context.
 * @returns Whether the user is an anonymous guest.
 */
export function isGuestUser<T extends object>(
  user: T | null | undefined,
): user is T & { isAnonymous: true } {
  return Boolean(
    user &&
      'isAnonymous' in user &&
      (user as { isAnonymous?: unknown }).isAnonymous === true,
  )
}

/**
 * Accepts only same-origin application paths for post-auth navigation.
 *
 * @param candidate - Untrusted return URL from query state or UI intent.
 * @returns A safe path/query/hash value, falling back to `/`.
 */
export function toSafeReturnPath(candidate?: string | null): string {
  if (!browser || !candidate) return '/'

  try {
    const parsed = new URL(candidate, window.location.origin)
    if (parsed.origin !== window.location.origin) return '/'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/'
  }
}

/**
 * Opens the centralized account-upgrade dialog.
 *
 * @param reason - Product intent that requires a durable account.
 * @param returnTo - Optional same-origin route to resume after authentication.
 * @returns Nothing.
 */
export function requestAccountUpgrade(
  reason: UpgradeReason = 'account',
  returnTo?: string | null,
): void {
  if (!browser) return
  window.dispatchEvent(
    new CustomEvent(UPGRADE_ACCOUNT_EVENT, {
      detail: { reason, returnTo: toSafeReturnPath(returnTo) },
    }),
  )
}

/**
 * Opens the profile account-upgrade dialog.
 *
 * @param returnTo - Optional same-origin route to resume after authentication.
 * @returns Nothing.
 */
export function requestProfileUpgrade(returnTo?: string | null): void {
  requestAccountUpgrade('profile', returnTo)
}
