// CONTACT INPUT
import { normalizeTelephone } from '#lib/utils/telephone.js'
import { parseMessagingContact } from '#lib/messaging/contactInput.js'
// TYPES
import type { AdminMessagingDraft } from './adminMessagingDraft.js'

/** Validate contact syntax locally before a profile can be submitted.
 * @param telephone Primary phone draft; empty values are allowed.
 * @param messaging Service field drafts.
 * @param saved Existing service values, including legacy native IDs that remain unchanged.
 * @returns Field-addressed errors without making network requests or changing drafts.
 */
export function validateAdminPhoneFields(
  telephone: string | null,
  messaging: AdminMessagingDraft,
  saved?: AdminMessagingDraft,
): Record<string, string> {
  const errors: Record<string, string> = {}
  if (telephone && !normalizeTelephone(telephone))
    errors.telephone =
      'Enter an eight-digit Hong Kong number or a valid international number starting with +.'
  for (const platform of ['whatsapp', 'telegram'] as const) {
    if (saved && messaging[platform].trim() === saved[platform]) continue
    const parsed = parseMessagingContact(messaging[platform])
    if (parsed.kind === 'invalid') errors[platform] = parsed.message
  }
  return errors
}
