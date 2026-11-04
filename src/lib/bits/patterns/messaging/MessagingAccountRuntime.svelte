<script lang="ts">
// SVELTE
import { onMount, untrack } from 'svelte'
// CONTEXT
import { getRootCTX } from '#lib/context/root.svelte.js'
// ADAPTER
import { createMessagingModel } from '#lib/adapters/messaging/useMessagingModel.svelte.js'
// TYPES
import type { MessagingPlatform } from '#lib/messaging/types.js'
import type { WhatsAppConsoleModel } from '#lib/bits/patterns/whatsapp/whatsapp.types.js'
let { account, register }: {
  account: { id: string; platform: MessagingPlatform; organisationCode: string }
  register: (id: string, model: WhatsAppConsoleModel) => () => void
} = $props()
// One mounted runtime per organisation account keeps both inboxes current without duplicate UI.
const model = untrack(() => createMessagingModel(account, getRootCTX().user?.id))
onMount(() => register(account.id, model))
</script>
