<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';

const mapContext = getMapContext();

// Get reactive filter count
const filterCount = $derived(mapContext.getFilterCount());
</script>

<button
  class="btn btn-ghost btn-sm w-full justify-start rounded-none bg-black px-4 font-normal"
  disabled={filterCount.neighbourhoods === 0 && filterCount.properties === 0}
  onclick={() => mapContext.clearFilters()}>
  {#if filterCount.neighbourhoods === 0 && filterCount.properties === 0}
    {m.filters__reset()}
  {:else}
    {m.filters__reset_count(filterCount)}
  {/if}
</button>
