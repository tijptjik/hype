import type { MessagingPlatform } from './types'

export interface MessagingAvailability {
  platform: MessagingPlatform
  accountId: string | null
  chatId: string | null
  available: boolean
  unavailableReason: string | null
  checking: boolean
}

/** Choose WhatsApp when reachable, otherwise Telegram; wait for WhatsApp's check before defaulting.
 * @param channels Independent platform discovery results.
 * @returns Default route plus the complete per-platform state.
 */
export function messagingAvailability(channels: MessagingAvailability[]) {
  const whatsapp = channels.find(channel => channel.platform === 'whatsapp')!
  const telegram = channels.find(channel => channel.platform === 'telegram')!
  const selected = whatsapp.available || whatsapp.checking ? whatsapp : telegram.available || telegram.checking ? telegram : whatsapp
  return { ...selected, checking: channels.some(channel => channel.checking), channels }
}
