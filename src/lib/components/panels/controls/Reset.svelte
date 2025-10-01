<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// ICONS
import { XMark } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';

// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
import { slide } from 'svelte/transition';
const appCtx = getAppCtx();

// Get reactive filter count
const filterCount = $derived(appCtx.getFilterCount());
</script>

<!-- TODO : Move to the bottom of the panel as an absolute bottom element -->

{#if filterCount.neighbourhoods > 0 || filterCount.properties > 0 || filterCount.openingHours}
  <div class="absolute bottom-4 z-10 h-auto w-full pb-[68px]">
    <button
      class="btn btn-ghost btn-sm ml-4 h-auto w-[calc(100%-1rem)] items-center justify-start rounded-none rounded-l-lg border-3 border-base-300 bg-black px-4 py-4 font-mono font-normal hover:text-white"
      disabled={filterCount.neighbourhoods === 0 &&
        filterCount.properties === 0 &&
        !filterCount.openingHours}
      onclick={() => appCtx.resetFilters()}
      transition:slide={{ duration: 200 }}>
      {#if filterCount.neighbourhoods === 0 && filterCount.properties === 0 && !filterCount.openingHours}
        {m.filters__reset()}
      {:else}
        {@const parts = [
          filterCount.openingHours ? 'opening hours' : null,
          filterCount.neighbourhoods > 0
            ? m.filters__reset_count_neighbourhoods({
                neighbourhoods: filterCount.neighbourhoods
              })
            : null,
          filterCount.properties > 0
            ? m.filters__reset_count_properties({ properties: filterCount.properties })
            : null
        ].filter(Boolean)}
        <Icon src={XMark} class="h-4 w-4" />
        {@html m.filters__clear() + ' ' + parts.join(' & ')}
      {/if}
    </button>
  </div>
{/if}
