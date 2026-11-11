// CONTENT
import { canonicalContentTag } from './contentRecords'
// TYPES
import type { AutomaticTranslation } from './automatic'

/** Serialize the immutable provider result without its transport signature.
 * @param translation Generated candidate. @param target Target content language.
 * @returns Stable signed payload.
 */
function payload(translation: AutomaticTranslation, target: string): string {
  return JSON.stringify([
    canonicalContentTag(target),
    translation.value,
    canonicalContentTag(translation.sourceLocale),
    translation.sourceHash,
    translation.sourceText,
    translation.provider,
    translation.model,
    translation.generatedAt,
  ])
}

/** Sign an automatic candidate so form submissions cannot fabricate provider provenance.
 * @param translation Server-generated candidate. @param target Target language.
 * @param secret Application signing secret. @returns Hexadecimal HMAC receipt.
 */
export async function signAutomaticTranslation(
  translation: AutomaticTranslation,
  target: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload(translation, target)),
  )
  return Array.from(new Uint8Array(signed), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

/** Verify a generated candidate at the persistence boundary.
 * @param translation Submitted candidate. @param target Target language.
 * @param secret Application signing secret. @returns Whether provenance is authentic.
 */
export async function verifyAutomaticTranslation(
  translation: AutomaticTranslation,
  target: string,
  secret: string,
): Promise<boolean> {
  if (!translation.receipt || !/^[a-f0-9]{64}$/.test(translation.receipt)) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const signature = Uint8Array.from(translation.receipt.match(/../g) ?? [], part =>
    parseInt(part, 16),
  )
  return crypto.subtle.verify(
    'HMAC',
    key,
    signature,
    new TextEncoder().encode(payload(translation, target)),
  )
}
