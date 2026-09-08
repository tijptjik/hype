// TYPES
import type { LinkedAuthAccount } from '$lib/types'

/**
 * Selects a linked account using Better Auth's local row identity.
 * @param account - Account returned by listAccounts, including its external identity.
 * @returns The selector shared by accountInfo and unlinkAccount.
 */
export function toLinkedAccountSelector(account: LinkedAuthAccount): {
  accountId: string
} {
  return { accountId: account.id }
}
