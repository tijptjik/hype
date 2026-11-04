// TYPES
import type { MessagingPlatform } from './types'

export interface MessagingAvailability {
  platform: MessagingPlatform
  accountId: string | null
  chatId: string | null
  available: boolean
  unavailableReason: string | null
  checking: boolean
}

/** Prefer the user's chosen platform when reachable, falling back after its availability check.
 * @param channels Independent platform discovery results.
 * @param preferredPlatform User-wide preference; null or omitted uses WhatsApp.
 * @returns Default route plus the complete per-platform state.
 */
export function messagingAvailability(
  channels: MessagingAvailability[],
  preferredPlatform: MessagingPlatform | null = null,
): MessagingAvailability & { channels: MessagingAvailability[] } {
  const preferred =
    channels.find(channel => channel.platform === (preferredPlatform ?? 'whatsapp')) ??
    channels[0]
  if (!preferred) throw new Error('At least one messaging channel is required')
  const fallback =
    channels.find(channel => channel.platform !== preferred.platform) ?? preferred
  const selected =
    preferred.available || preferred.checking
      ? preferred
      : fallback.available || fallback.checking
        ? fallback
        : preferred
  return { ...selected, checking: channels.some(channel => channel.checking), channels }
}
