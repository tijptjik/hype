// I18N
import { m } from '#lib/i18n.js'

/**
 * Explains a rejected password setup without exposing account details.
 * @param response - Failed response from the account password endpoint.
 * @returns Localized feedback with the recovery step for known failures.
 * @remarks Only session and rate-limit failures receive specific messages.
 */
export async function getPasswordSetupError(response: Response): Promise<string> {
  if (response.status === 401) return m.account__password_sign_in_again()
  if (response.status === 429) return m.account__password_rate_limited()
  return m.account__password_add_error()
}
