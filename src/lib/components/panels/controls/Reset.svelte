<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// ICONS
import XMark from 'virtual:icons/lucide/x'
import Icon from '$lib/components/common/Icon.svelte'

// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { slide } from 'svelte/transition'
const appCtx = getAppCtx()

// Get reactive filter count
const filterCount = $derived(appCtx.getFilterCount())
</script>

<!-- TODO : Move to the bottom of the panel as an absolute bottom element -->

{#if filterCount.neighbourhoods > 0 || filterCount.properties > 0}
  <div class="absolute bottom-4 z-10 h-auto w-full pb-17">
    <button
      class="btn btn-ghost btn-sm ml-4 h-auto w-[calc(100%-1rem)] items-center justify-start rounded-none rounded-l-lg border-3 border-base-300 bg-black px-4 py-4 font-mono font-normal hover:text-white"
      disabled={filterCount.neighbourhoods === 0 && filterCount.properties === 0}
      onclick={() => appCtx.resetFilters()}
      transition:slide={{ duration: 200 }}
    >
      {#if filterCount.neighbourhoods === 0 && filterCount.properties === 0}
        {m.filters__reset()}
      {:else}
        <Icon src={XMark} class="h-4 w-4" />
        {#if filterCount.neighbourhoods > 0 && filterCount.properties > 0}
          {@html m.filters__clear() +
            ' ' +
            m.filters__reset_count_neighbourhoods({
              neighbourhoods: filterCount.neighbourhoods
            }) +
            ' & ' +
            m.filters__reset_count_properties({ properties: filterCount.properties })}
        {:else if filterCount.neighbourhoods > 0}
          {@html m.filters__clear() +
            ' ' +
            m.filters__reset_count_neighbourhoods({
              neighbourhoods: filterCount.neighbourhoods
            })}
        {:else if filterCount.properties > 0}
          {@html m.filters__clear() +
            ' ' +
            m.filters__reset_count_properties({ properties: filterCount.properties })}
        {/if}
      {/if}
    </button>
  </div>
{/if}
