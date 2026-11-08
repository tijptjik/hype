<script lang="ts">
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
// COMPONENTS
import MessageBubble from '#lib/bits/patterns/whatsapp/components/MessageBubble.svelte'
// TYPES
import type {
  WhatsAppMessage,
  WhatsAppProfile,
  WhatsAppSend,
} from '#lib/api/services/whatsover.types.js'

let {
  row,
  preview,
  mediaUrl,
  profile,
  error,
  now,
  platformLabel,
  organisationName,
  canReset = false,
  onReset,
}: {
  row: WhatsAppSend
  preview?: WhatsAppMessage
  mediaUrl?: string
  profile?: WhatsAppProfile
  error?: string
  now: number
  organisationName?: string
  platformLabel: string
  canReset?: boolean
  onReset: () => void
} = $props()
const message = $derived<WhatsAppMessage>(
  preview ?? {
    id: row.request.requestId,
    chat: row.request.to,
    sender: 'self',
    fromMe: true,
    sequence: 0,
    timestamp: row.createdAt ?? 0,
    text: row.request.text,
    content: undefined,
  },
)
</script>

<div data-pending-send={row.request.requestId} class="flex min-w-0 flex-col gap-1">
  <MessageBubble
    {organisationName}
    {message}
    {now}
    {platformLabel}
    {mediaUrl}
    attachmentPending={Boolean(
      row.request.attachmentId &&
        (!preview || (preview.content?.kind === 'document' && !mediaUrl)),
    )}
    showTime={Boolean(preview || row.createdAt)}
    displayName={profile?.name || 'Shared account'}
    username={profile?.username}
    photo={profile?.photo}
    reactions={[]}
    disabled
    sendState={error ? 'uncertain' : row.state}
    onLoadMedia={async () => {}}
    onReply={() => {}}
    onReact={() => {}}
  />
  {#if row.state === 'uncertain' || error || (row.state === 'pending' && canReset)}
    <div
      class="text-muted-foreground ml-auto flex max-w-80 flex-col items-end gap-1 text-right text-xs"
    >
      {#if row.state === 'uncertain'}
        <p role="status">
          Delivery is uncertain. Check the conversation before sending this message
          again.
        </p>
      {/if}
      {#if canReset}
        <Button text="New message" size="sm" style="ghost" onClick={onReset} />
      {/if}
    </div>
  {/if}
</div>
