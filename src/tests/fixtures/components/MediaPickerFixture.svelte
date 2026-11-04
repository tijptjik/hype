<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// ADAPTER
import { createWhatsAppModel } from '#lib/adapters/whatsapp/useWhatsAppModel.svelte.js'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import CatalogSendBubble from '#lib/bits/patterns/messaging/CatalogSendBubble.svelte'
import ConversationPane from '#lib/bits/patterns/whatsapp/components/ConversationPane.svelte'
import MessageComposer from '#lib/bits/patterns/whatsapp/components/MessageComposer.svelte'

let {
  options,
  initialChat,
}: { options: Parameters<typeof createWhatsAppModel>[0]; initialChat?: string } =
  $props()
setResponsiveCtx()
const model = untrack(() => createWhatsAppModel(options))
untrack(() => {
  if (initialChat) {
    model.to = initialChat
    model.selectChat(initialChat)
  }
})
</script>

<p>{model.status.connected ? 'Connected' : 'Disconnected'}</p>
{#if model.error}
  <p role="alert">{model.error}</p>
{/if}
{#if initialChat}
  <ConversationPane
    {model}
    recipientLocked
    fill={false}
    displayName="Synthetic recipient"
  />
{:else}
  <MessageComposer {model} />
  <section aria-label="Messages">
    {#each model.catalogSends ?? [] as row (row.id)}
      <CatalogSendBubble
        {row}
        now={Date.now()}
        retry={() => model.retryCatalogSend?.(row.id)}
      />
    {/each}
  </section>
{/if}
