<script lang="ts">
// COMPONENTS
import OmnibarEntry from './OmnibarEntry.svelte'
// CONTEXT
import { getOmniCtx } from '$lib/context/omni.svelte'
// TYPES
import type { SearchResult } from '$lib/types'
import type { OmnibarSectionProps } from './omnibarPrimitives.types'

const omniCtx = getOmniCtx()

let { collectionType }: OmnibarSectionProps = $props()

const results = $derived<SearchResult[]>(omniCtx.searchResults[collectionType])
const limit = $derived<number>(omniCtx.limits[collectionType])
const onSelection = $derived<(ref: string) => void>(
  omniCtx.searchHandlers[collectionType],
)
</script>

<div class="flex shrink-0 select-none flex-col" role="group">
  {#each results.slice(0, limit) as result}
    <OmnibarEntry {result} {onSelection} />
  {/each}
</div>
