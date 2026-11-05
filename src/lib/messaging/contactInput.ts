// THIRD PARTY
import { AsYouType, parsePhoneNumberFromString } from 'libphonenumber-js/max'
// UTILITIES
import { normalizeTelephone } from '#lib/utils/telephone.js'
// TYPES
import type { MessagingIdentityFields } from './identity.js'

type ContactInput =
  | { kind: 'empty' }
  | { kind: 'invalid'; message: string }
  | { kind: 'valid'; value: string; identity: MessagingIdentityFields }

/** Delay feedback until enough contact text has been entered while preserving intentional clearing.
 * @param input Current phone number or username draft.
 * @returns Whether typing may trigger validation after the debounce.
 * @remarks Phone thresholds count eight national digits, excluding formatting and
 * an explicit international prefix. Usernames count four characters without @.
 */
export function shouldValidateMessagingContact(input: string): boolean {
  const text = input.trim()
  if (!text) return true
  if (/[a-zA-Z]/.test(text) || text.startsWith('@'))
    return text.replace(/^@/, '').length >= 4
  const phone = new AsYouType('HK')
  phone.input(text.replace(/^00/, '+'))
  return (phone.getNumber()?.nationalNumber.length ?? 0) >= 8
}

/** Interpret the single contact field without asking people for provider IDs.
 * @param input Phone number or messaging username entered by the person.
 * @returns Validated identity fields and display text, or an actionable input error.
 * @remarks Eight national digits use Hong Kong's +852 prefix. Bare numbers are
 * always treated as phones, never silently reinterpreted as a Telegram user ID.
 */
export function parseMessagingContact(input: string): ContactInput {
  const text = input.trim()
  if (!text) return { kind: 'empty' }
  if (/^@?[a-zA-Z]/.test(text) || text.startsWith('@')) {
    const username = text.replace(/^@/, '').toLowerCase()
    if (!/^[a-z][a-z0-9_]{4,31}$/.test(username))
      return {
        kind: 'invalid',
        message:
          'Use a username with 5–32 letters, numbers or underscores, starting with a letter.',
      }
    return {
      kind: 'valid',
      value: `@${username}`,
      identity: { phoneNumber: null, username, nativeId: null },
    }
  }
  const phoneNumber = normalizeTelephone(text)
  if (!phoneNumber || !parsePhoneNumberFromString(phoneNumber)?.isValid())
    return {
      kind: 'invalid',
      message:
        'Enter an eight-digit Hong Kong number or a valid international number starting with +.',
    }
  return {
    kind: 'valid',
    value: phoneNumber,
    identity: { phoneNumber, username: null, nativeId: null },
  }
}

/** Format saved contact details while retaining compatibility with older ID-only claims.
 * @param identity Saved identifiers, if any.
 * @returns One editable contact value, preferring the person's phone number.
 */
export function displayMessagingContact(identity?: MessagingIdentityFields): string {
  return (
    identity?.phoneNumber ||
    (identity?.username ? `@${identity.username}` : identity?.nativeId) ||
    ''
  )
}
