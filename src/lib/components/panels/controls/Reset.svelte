<script lang="ts">
// BITS COMPONENTS
import Button from '$lib/bits/core/button/Button.svelte'
// I18N
import { m } from '$lib/i18n'
// ICONS
import XMark from 'virtual:icons/lucide/x'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { fade } from 'svelte/transition'

const appCtx = getAppCtx()

// Get reactive filter count
const filterCount = $derived(appCtx.getFilterCount())
const hasActiveFilters = $derived(
  filterCount.neighbourhoods > 0 || filterCount.properties > 0,
)

function getResetText(): string {
  if (filterCount.neighbourhoods > 0 && filterCount.properties > 0) {
    return `${m.filters__clear()} ${m.filters__reset_count_neighbourhoods({
      neighbourhoods: filterCount.neighbourhoods,
    })} & ${m.filters__reset_count_properties({
      properties: filterCount.properties,
    })}`
  }

  if (filterCount.neighbourhoods > 0) {
    return `${m.filters__clear()} ${m.filters__reset_count_neighbourhoods({
      neighbourhoods: filterCount.neighbourhoods,
    })}`
  }

  if (filterCount.properties > 0) {
    return `${m.filters__clear()} ${m.filters__reset_count_properties({
      properties: filterCount.properties,
    })}`
  }

  return m.filters__reset()
}

const resetText = $derived(getResetText())
</script>

<!-- TODO : Move to the bottom of the panel as an absolute bottom element -->

{#if hasActiveFilters}
  <div class="absolute bottom-4 z-10 h-auto w-full px-4 pb-2">
    <Button
      text={resetText}
      iconComponent={XMark}
      iconClasses="h-4 w-4 shrink-0"
      color="dark"
      style="ghost"
      modifier="block"
      class="h-auto justify-start rounded-lg border-3 border-base-300 bg-black px-4 py-4 font-mono font-normal hover:text-white"
      labelClasses="min-w-0 flex-1 max-w-none truncate text-left leading-tight"
      onClick={() => appCtx.resetFilters()}
      transition={fade}
      transitionOpts={{ duration: 200 }}
    />
  </div>
{/if}
