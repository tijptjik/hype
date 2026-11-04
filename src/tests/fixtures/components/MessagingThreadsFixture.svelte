<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import MessagingInbox from '#lib/bits/patterns/messaging/MessagingInbox.svelte'
setResponsiveCtx()
</script>

<div class="h-dvh min-h-0"><MessagingInbox /></div>
