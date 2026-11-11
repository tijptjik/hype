// PHONE NUMBERS
import { normalizePhoneNumber, readPhoneNumbers } from '#lib/utils/phone-property.js'

/** Decode collection text for review without changing its stored representation.
 * @param value Inspected field text.
 * @param phone Whether the field uses the phone contract.
 * @returns Ordered entries, or null for scalar or malformed text.
 * @remarks Invalid phone entries remain visible rather than being dropped.
 */
export function mergePropertyEntries(value: string, phone = false): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed
  } catch {
    // Legacy scalar and multiline phone values need no JSON decoding.
  }
  return phone ? readPhoneNumbers(value) : null
}

/** Preserve non-string entries in a readable review representation.
 * @param value One collection entry.
 * @returns Text without JSON quotes for strings.
 */
export function mergePropertyEntryText(value: unknown): string {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? '')
}

/** Compare rendered field values rather than serialized storage or option metadata.
 * @param value Inspected or edited field text.
 * @param phone Whether the field uses the phone contract.
 * @returns Ordered collection values with canonical phones, or unchanged scalar text.
 * @remarks Array order and invalid entries remain significant.
 */
export function mergePropertyComparison(value: string, phone = false): unknown {
  const entries = mergePropertyEntries(value, phone)
  if (!entries) return value
  if (!entries.length) return ''
  return entries.map(entry =>
    phone && typeof entry === 'string' ? (normalizePhoneNumber(entry) ?? entry) : entry,
  )
}
