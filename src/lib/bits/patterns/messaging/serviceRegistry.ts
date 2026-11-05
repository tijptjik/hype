// ICONS
import WhatsApp from 'virtual:icons/simple-icons/whatsapp'
import Telegram from 'virtual:icons/simple-icons/telegram'
// TYPES
import type { MessagingPlatform } from '#lib/messaging/types.js'

/** Presentation metadata for supported contact services; provider adapters own validation. */
export const CONTACT_SERVICES = [
  { id: 'whatsapp', label: 'WhatsApp', icon: WhatsApp, placeholder: 'Phone number' },
  {
    id: 'telegram',
    label: 'Telegram',
    icon: Telegram,
    placeholder: 'Phone number or @username',
  },
] as const satisfies readonly {
  id: MessagingPlatform
  label: string
  icon: typeof WhatsApp
  placeholder: string
}[]
