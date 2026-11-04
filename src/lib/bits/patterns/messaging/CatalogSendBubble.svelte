<script lang="ts">
// COMPONENTS
import MessageBubble from '#lib/bits/patterns/whatsapp/components/MessageBubble.svelte'
// TYPES
import type { CatalogSend } from '#lib/messaging/media-catalog.js'
import type {
  WhatsAppMessage,
  WhatsAppProfile,
} from '#lib/api/services/whatsover.types.js'
let {
  row,
  now,
  profile,
  platformLabel,
  organisationName,
  retry,
}: {
  row: CatalogSend
  now: number
  profile?: WhatsAppProfile
  organisationName?: string
  platformLabel?: string
  retry: () => void
} = $props()
const message = $derived<WhatsAppMessage>({
  id: row.id,
  chat: row.chat,
  sender: 'self',
  fromMe: true,
  sequence: 0,
  timestamp: row.timestamp,
  text: null,
  content: {
    kind: row.item.kind === 'gif' ? 'video' : 'sticker',
    animated: row.item.kind === 'gif',
    mimeType: row.item.mimeType,
    text: null,
    fileName: row.item.title,
    byteLength: null,
    duration: null,
    voiceNote: false,
    viewOnce: false,
    quoted: null,
    reaction: null,
  },
})
</script>
<div data-catalog-send={row.id} class="flex min-w-0 flex-col gap-1">
  <MessageBubble
    {organisationName}
    {message}
    {now}
    {platformLabel}
    displayName={profile?.name || 'Shared account'}
    username={profile?.username}
    photo={profile?.photo}
    reactions={[]}
    disabled
    sendState={row.state}
    transitionName={row.transitioning ? 'catalog-send' : undefined}
    mediaUrl={row.url}
    onLoadMedia={async () => {}}
    onReply={() => {}}
    onReact={() => {}}
  />
  {#if row.error}
    <div class="ml-auto max-w-80 text-right text-xs text-muted-foreground" role="alert">
      <p>{row.error}</p>
      <button
        type="button"
        class="mt-1 rounded px-2 py-1 underline focus-visible:outline-2"
        onclick={retry}
      >
        {row.state === 'failed' ? 'Retry' : 'Check status'}
      </button>
    </div>
  {/if}
</div>
