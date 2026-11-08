<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// ADAPTER
import { createMessagingModel } from '#lib/adapters/messaging/useMessagingModel.svelte.js'
// COMPONENTS
import WhatsAppConsole from '#lib/bits/patterns/whatsapp/WhatsAppConsole.svelte'
// TYPES
import type { MessagingPlatform } from '#lib/messaging/types.js'
let {
  account,
  openedChat = null,
}: {
  openedChat?: { chatId: string; revision: number } | null
  account: { id: string; platform: MessagingPlatform; organisationCode: string }
} = $props()
// The parent keys each account so drafts and retries stay pinned to their original platform.
const model = untrack(() => createMessagingModel(account))
$effect(() => {
  if (openedChat) {
    void openedChat.revision
    untrack(() => model.selectChat(openedChat!.chatId))
  }
})
</script>
<WhatsAppConsole {model} />
