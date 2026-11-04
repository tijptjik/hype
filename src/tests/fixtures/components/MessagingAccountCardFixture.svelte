<script lang="ts">
// SVELTE
import type { ComponentProps } from 'svelte'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import Card from '#lib/bits/patterns/messaging/MessagingAccountCard.svelte'
let props: ComponentProps<typeof Card> = $props()
setResponsiveCtx()
</script>
<Card {...props} />
