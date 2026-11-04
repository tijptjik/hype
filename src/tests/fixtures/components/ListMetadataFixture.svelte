<script lang="ts">
// TYPES
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'

let { view }: { view: ResourceViewCtx } = $props()
const total = $derived(view.getListQueryMeta(view.featuresQueryKey())?.totalCount)
</script>

<output aria-label="Feature total">{total ?? 'Unknown'}</output>
