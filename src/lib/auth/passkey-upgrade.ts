// AUTH
import { authClient, useSession } from '$lib/auth/client'
// TYPES
import type { PasskeyAccountUpgradeInput } from '$lib/types'

/** Error raised when registering a new passkey fails. */
export class PasskeyRegistrationError extends Error {}

/** Error raised when a saved passkey cannot refresh the current signed session. */
export class PasskeySessionRefreshError extends Error {}

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
 * Adds a passkey when needed and refreshes the promoted account's signed session.
 *
 * @param input - Optional profile and email data to save while completing the upgrade.
 * @returns Nothing after the session refresh and all session consumers have updated.
 * @throws {PasskeyRegistrationError} When the browser or authenticator cannot add a passkey.
 * @throws {PasskeySessionRefreshError} When the passkey was saved but the session could not refresh.
 * @remarks Retries reuse an existing passkey before refreshing the session, updating the
 * profile, or requesting email verification. `input.onPasskeyReady` runs after the credential
 * is accepted and before the remaining account setup calls begin.
 */
export async function completePasskeyAccountUpgrade(
  input: PasskeyAccountUpgradeInput,
): Promise<void> {
  await ensurePasskeyForCurrentUser()
  input.onPasskeyReady?.()

  // Refresh the stale anonymous session cache before issuing any account update requests.
  const promotionResponse = await fetch('/api/account/passkey', { method: 'POST' })
  if (!promotionResponse.ok) throw new PasskeySessionRefreshError()

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

  if (email) {
    const emailResult = await authClient.changeEmail({
      newEmail: email,
      callbackURL: input.emailCallbackUrl,
    })
    if (emailResult.error) throw new Error(emailResult.error.message)
  }

  // Refresh the session atom so every active useSession consumer sees the new account.
  await useSession().get().refetch()
}
