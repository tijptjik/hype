<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import PublishUnclassifiedImagesDialog from '#lib/bits/patterns/images/PublishUnclassifiedImagesDialog.svelte'

let { scopeId = 'one', onDone }: { scopeId?: string; onDone: () => void } = $props()
setResponsiveCtx()
</script>

<PublishUnclassifiedImagesDialog scopeType="feature" {scopeId} {onDone} />
