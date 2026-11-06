// TYPES
import type { MessagingPlatform } from './types'

/** Provider availability is independent of saved organisation account settings.
 * Both providers remain suspended until their rollout is explicitly enabled.
 */
export const messagingIntegrations: Readonly<Record<MessagingPlatform, boolean>> = {
  whatsapp: false,
  telegram: false,
}
