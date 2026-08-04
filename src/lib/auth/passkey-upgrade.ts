// AUTH
import { authClient } from '$lib/auth/client'
// TYPES
import type { PasskeyAccountUpgradeInput } from '$lib/types'

/** Error raised when registering a new passkey fails. */
export class PasskeyRegistrationError extends Error {}

/**
 * Reuses an existing passkey or registers one for the current user.
 *
 * @returns Nothing after the current user has at least one passkey.
 * @throws {PasskeyRegistrationError} When a new passkey cannot be registered.
 */
export async function ensurePasskeyForCurrentUser(): Promise<void> {
  const existingPasskeys = await authClient.passkey.listUserPasskeys()
  if (existingPasskeys.error) throw new Error(existingPasskeys.error.message)
  if (existingPasskeys.data?.length) return

  const passkeyResult = await authClient.passkey.addPasskey({ name: 'HYPE passkey' })
  if (passkeyResult.error) {
    throw new PasskeyRegistrationError(passkeyResult.error.message)
  }
}

/**
 * Adds a passkey when needed and promotes the current guest into a durable account.
 *
 * @param input - Optional profile and email data to save while completing the upgrade.
 * @returns Nothing after the server has promoted the account and the session has refreshed.
 * @remarks Retries reuse an existing passkey before updating the profile, promoting the account,
 * or requesting email verification.
 */
export async function completePasskeyAccountUpgrade(
  input: PasskeyAccountUpgradeInput,
): Promise<void> {
  await ensurePasskeyForCurrentUser()

  const profile: { name?: string; username?: string } = {}
  const name = input.name?.trim()
  const username = input.username?.trim()
  const email = input.email?.trim()
  if (name) profile.name = name
  if (username) profile.username = username
  if (Object.keys(profile).length > 0) {
    const profileResult = await authClient.updateUser(profile)
    if (profileResult.error) throw new Error(profileResult.error.message)
  }

  // The server verifies the new credential before making the guest account durable.
  const promotionResponse = await fetch('/api/account/passkey', { method: 'POST' })
  if (!promotionResponse.ok) throw new Error('account not upgraded')

  if (email) {
    const emailResult = await authClient.changeEmail({
      newEmail: email,
      callbackURL: input.emailCallbackUrl,
    })
    if (emailResult.error) throw new Error(emailResult.error.message)
  }

  await authClient.getSession()
}
