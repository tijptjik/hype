// TYPES
import type { MessagingPlatform } from './types'

/** Independently retained identifiers; a native ID is routable only after ownership verification. */
export interface MessagingIdentityFields {
  phoneNumber: string | null
  username: string | null
  nativeId: string | null
}

/** Check a provider's user identifier without accepting groups or channels.
 * @param platform Messaging provider.
 * @param value Candidate native ID.
 * @returns Whether this is a supported native user address.
 */
export function isMessagingNativeId(
  platform: MessagingPlatform,
  value: string,
): boolean {
  return platform === 'telegram'
    ? /^[1-9]\d{0,19}$/.test(value)
    : /^[1-9]\d{0,19}@(s\.whatsapp\.net|lid)$/.test(value)
}

/** Normalize separately submitted identifiers without inferring ownership or a native ID.
 * @param platform Messaging provider.
 * @param fields Complete editable identity fields.
 * @returns Canonical phone/username spelling and the opaque native ID.
 * @remarks Empty fields become null; unsupported or malformed identifiers throw.
 */
export function normalizeMessagingIdentity(
  platform: MessagingPlatform,
  fields: MessagingIdentityFields,
): MessagingIdentityFields {
  const phoneNumber = fields.phoneNumber?.trim().replace(/[\s()-]/g, '') || null
  const username = fields.username?.trim().replace(/^@/, '').toLowerCase() || null
  const nativeId = fields.nativeId?.trim() || null
  if (phoneNumber && !/^\+[1-9]\d{6,14}$/.test(phoneNumber))
    throw new Error('Use an international phone number starting with +')
  if (username && !/^[a-zA-Z0-9_]{5,32}$/.test(username))
    throw new Error('Use a valid messaging username')
  if (nativeId && !isMessagingNativeId(platform, nativeId))
    throw new Error('Use a native user ID, not a group or channel')
  return { phoneNumber, username, nativeId }
}

/** Build independent provider lookups so conflicting submitted identifiers cannot be verified together.
 * @param platform Messaging provider.
 * @param fields Normalized identifiers.
 * @returns Deduplicated native addresses, usernames and phone lookups.
 */
export function messagingIdentityLookups(
  platform: MessagingPlatform,
  fields: MessagingIdentityFields,
): string[] {
  return [
    ...new Set(
      [
        fields.nativeId,
        platform === 'telegram' && fields.username ? `@${fields.username}` : null,
        fields.phoneNumber
          ? platform === 'whatsapp'
            ? `${fields.phoneNumber.slice(1)}@s.whatsapp.net`
            : fields.phoneNumber
          : null,
      ].filter((value): value is string => Boolean(value)),
    ),
  ]
}
