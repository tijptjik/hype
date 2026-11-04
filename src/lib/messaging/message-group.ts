// TYPES
import type { WhatsAppMessage } from '#lib/api/services/whatsover.types.js'

/** Group adjacent messages only when their sender, audited operator, day and short time window agree.
 * @param previous Earlier visible message, if present.
 * @param current Later visible message, if present.
 * @returns Whether the later bubble can omit its repeated sender header.
 */
export function sameMessageGroup(
  previous?: WhatsAppMessage,
  current?: WhatsAppMessage,
): boolean {
  if (!previous || !current || previous.deleted || current.deleted) return false
  return (
    previous.chat === current.chat &&
    previous.sender === current.sender &&
    previous.fromMe === current.fromMe &&
    previous.operator?.id === current.operator?.id &&
    current.timestamp >= previous.timestamp &&
    current.timestamp - previous.timestamp <= 5 * 60_000 &&
    new Date(previous.timestamp).toDateString() ===
      new Date(current.timestamp).toDateString()
  )
}
