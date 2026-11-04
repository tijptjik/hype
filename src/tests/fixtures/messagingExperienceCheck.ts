// STYLES
import '#lib/styles/app.css'
// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/ConversationPaneFixture.svelte'
// MESSAGING
import {
  chatAppearanceStyle,
  DEFAULT_CHAT_APPEARANCE,
  TOASTIE_CHAT_BACKGROUND,
} from '#lib/messaging/appearance.js'
// TYPES
import type { WhatsAppConsoleModel } from '#lib/bits/patterns/whatsapp/whatsapp.types.js'
import type { BridgeMessage } from '#lib/messaging/types.js'

const params = new URLSearchParams(location.search)
const platform = params.get('platform') === 'whatsapp' ? 'whatsapp' : 'telegram'
const chat = platform === 'telegram' ? '42' : '15555550100@s.whatsapp.net'
const self = platform === 'telegram' ? '99' : '15555550200@s.whatsapp.net'
const events: string[] = []
const network = (): boolean => localStorage.getItem('fixture-network') !== 'off'
const photo =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="16" fill="#ebaa52"/><path d="M8 17q8 10 16 0" stroke="#222" stroke-width="2" fill="none"/></svg>',
  )
const long =
  'A clear, readable conversation with long messages that wrap within a comfortable width. '.repeat(
    5,
  )
const messages: BridgeMessage[] = [
  {
    id: '1',
    chat,
    sender: chat,
    sequence: 1,
    fromMe: false,
    timestamp: Date.now(),
    text: long,
  },
  {
    id: '2',
    chat,
    sender: self,
    sequence: 2,
    fromMe: true,
    timestamp: Date.now(),
    text: 'https://example.invalid/' + 'LongUnbrokenAddress'.repeat(15),
    delivery: 'read',
  },
  {
    id: '3',
    chat,
    sender: chat,
    sequence: 3,
    fromMe: false,
    timestamp: Date.now(),
    text: 'A cached image with a caption that wraps. '.repeat(5),
    content: {
      kind: 'image',
      text: null,
      mimeType: 'image/webp',
      fileName: 'collection.webp',
      byteLength: 300,
      duration: null,
      voiceNote: false,
      viewOnce: false,
      quoted: null,
      reaction: null,
    },
  },
]
const unavailable = async (): Promise<never> => {
  throw new Error('Synthetic fixture has no provider')
}
Object.assign(window, { experienceFixture: { events, messages } })
document.getElementById('app')!.style.cssText = chatAppearanceStyle({
  ...DEFAULT_CHAT_APPEARANCE,
  image: TOASTIE_CHAT_BACKGROUND,
})
mount(Fixture, {
  target: document.getElementById('app')!,
  props: {
    selectedChat: chat,
    onReady(model: WhatsAppConsoleModel) {
      Object.assign(
        (window as unknown as { experienceFixture: object }).experienceFixture,
        { model },
      )
    },
    options: {
      viewId: 'experience-fixture',
      platform,
      recipientLocked: true,
      cacheScope: `${params.get('operator') || 'experience-operator'}:${platform}`,
      transport: {
        snapshot: async () => ({
          status: {
            connected: true,
            loggedOut: false,
            qr: null,
            qrExpiresAt: null,
            identity: { id: self, name: 'Our team', username: null, phone: null },
          },
          messages: structuredClone(messages),
          outbox: [],
        }),
        connect: unavailable,
        disconnect: unavailable,
        upload: unavailable,
        voiceTicket: unavailable,
        declineCall: unavailable,
        send: unavailable,
        profile: async jid => {
          events.push(`profile:${jid}`)
          if (!network()) throw new Error('Synthetic profile offline')
          return {
            jid,
            name: jid === self ? 'Our team' : 'Neighbour',
            username: null,
            phone: null,
            aliases: [jid],
            photo,
          }
        },
        media: async (_chat, target) => {
          events.push(`media:${target.id}`)
          if (!network()) throw new Error('Synthetic media offline')
          return new Uint8Array(
            await (await fetch('/__media-fixture.webp')).arrayBuffer(),
          )
        },
        searchMedia: async () => ({ items: [], nextOffset: null }),
        catalogMedia: unavailable,
        stageMedia: unavailable,
      },
    },
  },
})
