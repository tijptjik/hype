// TYPES
import type { BridgeMessage } from './types.js'

/** Find the original only inside the quoted conversation, allowing verified sender aliases.
 * @param source Message containing the native reply reference.
 * @param messages Candidates already scoped to one account.
 * @param canonical Resolve SDK-verified peer aliases; the server uses exact stored addresses.
 * @returns The unambiguous original, or null when it has not been synced or cannot be identified.
 */
export function findQuotedMessage(
  source: BridgeMessage,
  messages: readonly BridgeMessage[],
  canonical: (address: string) => string = address => address,
): BridgeMessage | null {
  const quote = source.content?.quoted
  if (!quote?.id || (quote.chat && canonical(quote.chat) !== canonical(source.chat))) return null
  const candidates = messages.filter(message => message.id === quote.id
    && canonical(message.chat) === canonical(source.chat)
    && !['protocol', 'reaction'].includes(message.content?.kind ?? ''))
  const senderMatches = quote.sender ? candidates.filter(message => canonical(message.sender) === canonical(quote.sender)) : []
  // Telegram replies can omit the sender, and WhatsApp may quote a different verified device alias.
  return senderMatches.length === 1 ? senderMatches[0] : candidates.length === 1 ? candidates[0] : null
}


/** Check an excerpt against its original, preserving UTF-16 offsets including emoji.
 * @param text Original message text or caption.
 * @param quote Explicitly selected excerpt.
 * @returns Whether the quote is bounded and exactly matches the source.
 */
export function validTextQuote(text: string, quote: { text: string; offset: number }): boolean {
  return Boolean(quote.text.trim()) && new TextEncoder().encode(quote.text).length <= 1024
    && Number.isSafeInteger(quote.offset) && quote.offset >= 0
    && text.slice(quote.offset, quote.offset + quote.text.length) === quote.text
}

/** Render a native excerpt first, falling back to the resolved original's text or media label.
 * @param source Reply containing the platform's quote reference.
 * @param original Its resolved original, when available.
 * @returns A readable preview without exposing deleted or view-once content.
 */
export function quotedPreview(source: BridgeMessage, original?: BridgeMessage | null): string {
  if (original?.deleted) return 'Message deleted'
  if (original?.content?.viewOnce) return 'View-once message'
  const text = source.content?.quoted?.text || original?.content?.text || original?.text
  if (text) return text
  const kind = original?.content?.kind || source.content?.quoted?.kind
  if (kind === 'text' || !kind) return 'Original message unavailable'
  return ({ image: 'Photo', video: 'Video', sticker: 'Sticker', audio: 'Audio message', document: 'Attachment' } as Record<string, string>)[kind] || 'Message'
}
