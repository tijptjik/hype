<script lang="ts">
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
// COMPONENTS
import MessageBubble from '#lib/bits/patterns/whatsapp/components/MessageBubble.svelte'
// TYPES
import type { WhatsAppMessage, WhatsAppProfile, WhatsAppSend } from '#lib/api/services/whatsover.types.js'

let { row, preview, profile, error, now, platformLabel, canReset = false, onReset }: {
  row: WhatsAppSend
  preview?: WhatsAppMessage
  profile?: WhatsAppProfile
  error?: string
  now: number
  platformLabel: string
  canReset?: boolean
  onReset: () => void
} = $props()
const message = $derived<WhatsAppMessage>(preview ?? {
  id: row.request.requestId, chat: row.request.to, sender: 'self', fromMe: true,
  sequence: 0, timestamp: row.createdAt ?? 0, text: row.request.text,
  content: row.request.attachmentId ? {
    kind: 'document', text: row.request.text, fileName: 'Attachment', mimeType: null,
    byteLength: null, duration: null, voiceNote: false, viewOnce: false, quoted: null, reaction: null,
  } : undefined,
})
</script>

<div data-pending-send={row.request.requestId} class="flex min-w-0 flex-col gap-1">
  <MessageBubble {message} {now} {platformLabel} showTime={Boolean(preview || row.createdAt)} displayName={profile?.name || 'You'} username={profile?.username} photo={profile?.photo} reactions={[]} disabled sendState={error ? 'uncertain' : row.state} onLoadMedia={async () => {}} onReply={() => {}} onReact={() => {}} />
  {#if row.state === 'uncertain' || error || (row.state === 'pending' && canReset)}
    <div class="ml-auto flex max-w-80 flex-col items-end gap-1 text-right text-xs text-muted-foreground">
      {#if row.state === 'uncertain'}<p role="status">Delivery is uncertain. Check the conversation before sending this message again.</p>{/if}
      {#if canReset}<Button text="New message" size="sm" style="ghost" onClick={onReset} />{/if}
    </div>
  {/if}
</div>
