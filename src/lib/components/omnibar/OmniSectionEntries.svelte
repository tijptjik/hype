<script lang="ts">
// CONTEXT
import { getOmniCtx } from '$lib/context/omni.svelte'
// COMPONENTS
import OmniEntry from './OmniEntry.svelte'
// ENUMS
import { OmniCollection } from '$lib/enums'
// TYPES
import type { SearchResult } from '$lib/types'

// TYPES
type Props = {
  collectionType: OmniCollection
}

// CONTEXT
const omniCtx = getOmniCtx()

// PROPS
let { collectionType }: Props = $props()

// DERIVED
let results: SearchResult[] = $derived(omniCtx.searchResults[collectionType])
let limit: number = $derived(omniCtx.limits[collectionType])
let onSelection: (ref: string) => void = $derived(
  omniCtx.searchHandlers[collectionType],
)
</script>

<div class="flex flex-shrink-0 select-none flex-col" role="group">
  {#each results.slice(0, limit) as result, idx}
    <OmniEntry {result} {onSelection} />
  {/each}
</div>
