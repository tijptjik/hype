<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import ChatBackgroundSettings from '#lib/bits/patterns/messaging/ChatBackgroundSettings.svelte'
setResponsiveCtx()
</script>

<ChatBackgroundSettings organisationId="synthetic-organisation" />
