<script lang="ts">
// COMPONENTS
import MessageBubble from '#lib/bits/patterns/whatsapp/components/MessageBubble.svelte'
// TYPES
import type { BridgeMessage } from '#lib/messaging/types.js'

// Synthetic messages stay local to the preview and use the same millisecond clock as the inbox.
const now = new Date(2026, 10, 6, 14, 35).getTime()
const collectionText =
  'Hello! We have fresh bread ready for today’s collection. Could your team arrive at the side entrance around 14:30?\n\n> Please bring two insulated bags and check in with the bakery team.\n\nLet us know if you need a little more time so we can keep everything together for you.'
const photoCaption =
  'Here’s a look at today’s bread. Everything will be packed and ready for your team. Thank you for helping it reach the neighbourhood!'
// Bundled preview photo (Unsplash License): https://images.unsplash.com/photo-1509440159596-0249088772ff
const messages: BridgeMessage[] = [
  {
    id: 'preview-collection',
    sequence: 1,
    chat: 'preview-bakery',
    sender: 'preview-bakery',
    senderName: 'Neighbourhood Bakery',
    timestamp: now - 8 * 60_000,
    fromMe: false,
    text: collectionText,
  },
  {
    id: 'preview-reply',
    sequence: 2,
    chat: 'preview-bakery',
    sender: 'preview-team',
    timestamp: now - 6 * 60_000,
    editedAt: now - 5 * 60_000,
    fromMe: true,
    delivery: 'read',
    text: 'Thanks for setting everything aside! Our volunteers are on their way with the bags. We’ll use the side entrance and message you when we arrive.',
    operator: {
      id: 'preview-operator',
      name: 'Collection coordinator',
      username: null,
      image: null,
    },
    content: {
      kind: 'text',
      text: null,
      mimeType: null,
      fileName: null,
      byteLength: null,
      duration: null,
      voiceNote: false,
      viewOnce: false,
      quoted: {
        id: 'preview-collection',
        sender: 'preview-bakery',
        senderName: 'Neighbourhood Bakery',
        text: 'Could your team arrive at the side entrance around 14:30?',
        offset: collectionText.indexOf('Could your team'),
        kind: 'text',
      },
      reaction: null,
    },
  },
  {
    id: 'preview-photo',
    sequence: 3,
    chat: 'preview-bakery',
    sender: 'preview-bakery',
    senderName: 'Neighbourhood Bakery',
    timestamp: now - 3 * 60_000,
    fromMe: false,
    text: photoCaption,
    reactions: [{ emoji: '❤️', count: 2 }],
    content: {
      kind: 'image',
      text: photoCaption,
      mimeType: 'image/jpeg',
      fileName: 'bakery-collection.jpg',
      byteLength: null,
      duration: null,
      voiceNote: false,
      viewOnce: false,
      quoted: null,
      reaction: null,
    },
  },
]
</script>

<div class="flex min-w-0 flex-col gap-5">
  {#each messages as message (message.id)}
    <MessageBubble
      {message}
      {now}
      displayName={message.fromMe ? 'Collection team' : message.senderName || ''}
      organisationName="Collection team"
      quoteOriginal={message.content?.quoted ? messages[0] : undefined}
      quoteName="Neighbourhood Bakery"
      reactions={message.reactions ?? []}
      mediaUrl={message.content?.kind === 'image'
        ? '/messaging/bakery-collection.jpg'
        : undefined}
      disabled
      showActions={false}
      onLoadMedia={async () => {}}
      onReply={() => {}}
      onReact={() => {}}
    />
  {/each}
</div>
