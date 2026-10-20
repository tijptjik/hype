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

/** Normalizes an international number or an unprefixed Hong Kong local number.
 * @param value User-entered number, optionally beginning with + or 00.
 * @returns E.164 number, or null when invalid.
 */
export function normalizePhoneNumber(value: string): string | null {
  const compact = value
    .trim()
    .replace(/[\s()-]/gu, '')
    .replace(/^00/, '+')
  if (!/^\+?\d+$/.test(compact)) return null
  const phone = parsePhoneNumberFromString(compact, 'HK')
  return phone?.isValid() ? phone.number : null
}

/**
 * Decode a phone collection from JSON storage or one-number-per-line form input.
 * @param value Legacy scalar, serialized array, or multiline input.
 * @returns Ordered valid numbers with original spelling; null if any item is invalid.
 * @remarks Empty editor rows are omitted. Nonempty invalid members are rejected;
 * prose, commas and slashes are never split into multiple numbers.
 */
export function readPhoneNumbers(value: string | null | undefined): string[] | null {
  if (!value?.trim()) return []
  let values: unknown
  if (value.trim().startsWith('[')) {
    try {
      values = JSON.parse(value)
    } catch {
      return null
    }
  } else
    values = value
      .split(/\r?\n/u)
      .map(item => item.trim())
      .filter(Boolean)
  if (!Array.isArray(values) || values.some(item => typeof item !== 'string'))
    return null
  // Empty editor rows are optional placeholders, not invalid phone numbers.
  const numbers = (values as string[]).filter(item => item.trim())
  return numbers.every(number => normalizePhoneNumber(number)) ? numbers : null
}

/**
 * Format phone collections for display without showing JSON punctuation.
 * @param value Persisted phone collection or legacy scalar.
 * @param separator Display separator, or a newline for editing.
 * @returns All numbers in order; invalid legacy text is retained for correction.
 */
export function formatPhoneNumbers(
  value: string | null | undefined,
  separator = ', ',
): string {
  return readPhoneNumbers(value)?.join(separator) ?? value ?? ''
}

/** Formats a stored number with its country flag for read-only presentation.
 * @param value International number or local Hong Kong number.
 * @returns Spaced display text, dial target and flag; invalid legacy text is preserved.
 */
export function phoneDisplay(value: string): {
  text: string
  href: string | null
  flag: string
  country: string | undefined
} {
  const normalized = normalizePhoneNumber(value)
  const phone = normalized ? parsePhoneNumberFromString(normalized) : undefined
  const country = phone?.country
  return {
    text: phone?.formatInternational() ?? value,
    href: phone ? `tel:${phone.number}` : null,
    flag: country
      ? String.fromCodePoint(...[...country].map(char => 127397 + char.charCodeAt(0)))
      : '',
    country,
  }
}
