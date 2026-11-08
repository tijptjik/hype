<script lang="ts">
// SVELTE
import { onMount, untrack } from 'svelte'
// ADAPTER
import { createWhatsAppModel } from '#lib/adapters/whatsapp/useWhatsAppModel.svelte.js'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import ConversationPane from '#lib/bits/patterns/whatsapp/components/ConversationPane.svelte'
// TYPES
import type { WhatsAppConsoleModel } from '#lib/bits/patterns/whatsapp/whatsapp.types.js'

let {
  options,
  selectedChat,
  onReady,
}: {
  options: Parameters<typeof createWhatsAppModel>[0]
  selectedChat: string
  onReady?: (model: WhatsAppConsoleModel) => void
} = $props()
setResponsiveCtx()
const model = untrack(() => createWhatsAppModel(options))
onMount(() => {
  model.selectChat(selectedChat)
  onReady?.(model)
})
</script>

<div class="flex h-[600px] min-h-0 min-w-0">
  <ConversationPane
    {model}
    recipientLocked
    displayName="HYPE Test User"
    username="hype-test-user"
  />
</div>
