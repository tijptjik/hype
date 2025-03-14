<script lang="ts">
  // CONTEXT
  import { getOmniContext } from '$lib/context/omni.svelte';
// COMPONENTS
import OmniEntry from './OmniEntry.svelte';
// TYPES
import type { SearchResult, OmniGroup } from '$lib/types';

// TYPES
type Props = {
  group: OmniGroup;
};

// CONTEXT
const omniContext = getOmniContext();

// PROPS
let { group }: Props = $props();

// DERIVED
let results: SearchResult[] = $derived(omniContext.searchResults[group]);
let limit: number = $derived(omniContext.limits[group]);
let onSelection: (ref: string) => void = $derived(omniContext.searchHandlers[group]);
</script>

<div class="flex flex-shrink-0 flex-col select-none" role="group">
  {#each results.slice(0, limit) as result, idx}
    <OmniEntry {result} {onSelection} />
  {/each}
</div>
