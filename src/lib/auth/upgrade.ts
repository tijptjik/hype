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
