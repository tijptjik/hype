/** Stored provider observation; this never proves account ownership. */
export interface ContactValidation {
  status: 'confirmed' | 'not-found' | 'unavailable'
  message: string
  checkedAt: number
  accountId: string | null
}

/** Check freshness without making page reads trigger provider requests.
 * @param value Stored observation for the current claim.
 * @param now Current timestamp in milliseconds.
 * @returns Whether a new explicit check can reuse this observation.
 */
export function isContactValidationFresh(
  value: ContactValidation | null,
  now = Date.now(),
): boolean {
  return Boolean(
    value && now - value.checkedAt < (value.status === 'confirmed' ? 600_000 : 60_000),
  )
}

/** Private saved messaging data supplied with an editable profile. */
export interface MessagingProfileSettings {
  platform: 'whatsapp' | 'telegram'
  preferredPlatform: 'whatsapp' | 'telegram' | null
  identities: {
    platform: 'whatsapp' | 'telegram'
    phoneNumber: string | null
    username: string | null
    nativeId: string | null
    verifiedAt: number | null
    updatedAt: number
    validation: ContactValidation | null
  }[]
}
