// LIBRARIES
import { parsePhoneNumberFromString } from 'libphonenumber-js/max'

/**
 * Normalize contact numbers using Hong Kong for national input.
 * @param value Phone text, optionally containing whitespace or a 00 international prefix.
 * @returns A structurally valid E.164 number, or null for invalid, missing or extension-bearing input.
 * @remarks Hong Kong numbers must have exactly eight national digits. Validation
 * checks country-specific lengths, not allocation, reachability or ownership.
 */
export function normalizeTelephone(value: string | null): string | null {
  if (!value?.trim()) return null
  let input = value.replace(/\s/g, '')
  if (input.startsWith('00')) input = `+${input.slice(2)}`
  // Legacy users also entered the Hong Kong country code without a plus sign.
  const digits = input.replace(/[().-]/g, '')
  if (/^852\d{8}$/.test(digits)) input = `+${digits}`
  const phone = parsePhoneNumberFromString(input, {
    defaultCountry: 'HK',
    extract: false,
  })
  if (!phone?.isPossible() || phone.ext) return null
  if (phone.countryCallingCode === '852' && phone.nationalNumber.length !== 8)
    return null
  return phone.number
}
