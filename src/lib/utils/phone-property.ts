// PHONE NUMBERS
import { parsePhoneNumberFromString } from 'libphonenumber-js/max'

/**
 * Validates a Hong Kong phone property and returns its E.164 representation.
 * @param value - Local eight-digit number or an international +852 number.
 * @returns Canonical number, or null for empty/invalid/non-Hong Kong input.
 * @remarks Accepts formatting spaces, parentheses and hyphens, but not extensions,
 * surrounding prose or multiple numbers. Supports valid landlines and mobiles.
 */
export function normalizeHongKongPhoneNumber(value: string): string | null {
  const compact = value.replace(/[\s()-]/gu, '')
  if (!/^(?:\+852)?\d{8}$/u.test(compact)) return null
  const phone = parsePhoneNumberFromString(compact, 'HK')
  return phone?.country === 'HK' && phone.isValid() ? phone.number : null
}
