<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// ICONS
import { XMark } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';

// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
import { slide } from 'svelte/transition';
const mapContext = getMapContext();

// Get reactive filter count
const filterCount = $derived(mapContext.getFilterCount());
</script>

<!-- TODO : Move to the bottom of the panel as an absolute bottom element -->

{#if filterCount.neighbourhoods > 0 || filterCount.properties > 0}
  <button
    class="btn btn-ghost btn-sm w-full justify-start rounded-none bg-black px-6 py-2 font-mono font-normal"
    disabled={filterCount.neighbourhoods === 0 && filterCount.properties === 0}
    onclick={() => mapContext.clearFilters()}
    transition:slide={{ duration: 200 }}>
    {#if filterCount.neighbourhoods === 0 && filterCount.properties === 0}
      {m.filters__reset()}
    {:else}
      <Icon src={XMark} class="h-4 w-4" />
      {m.filters__reset_count(filterCount)}
    {/if}
  </button>
{/if}
