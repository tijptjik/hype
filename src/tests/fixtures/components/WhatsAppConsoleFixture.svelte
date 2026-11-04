<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// ADAPTER
import { createWhatsAppModel } from '#lib/adapters/whatsapp/useWhatsAppModel.svelte.js'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import WhatsAppConsole from '#lib/bits/patterns/whatsapp/WhatsAppConsole.svelte'

let { options }: { options: Parameters<typeof createWhatsAppModel>[0] } = $props()
setResponsiveCtx()
const model = untrack(() => createWhatsAppModel(options))
</script>

<WhatsAppConsole {model} />
