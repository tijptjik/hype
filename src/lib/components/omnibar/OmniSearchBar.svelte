<script lang="ts">
// TRANSITIONS
import { slide } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// ICONS
import { Icon } from '$lib/bits'
import MagnifyingGlass from 'virtual:icons/lucide/search'
// TRANSITIONS
import { fade } from 'svelte/transition'
import { getOmniCtx } from '$lib/context/omni.svelte'
// ACTIONS
import { clickOutside, focusOnSlash, handleEscape, selectOnEnter } from '$lib/actions'
// COMPONENTS
import OmniResults from '$lib/components/omnibar/OmniResults.svelte'
import OmniNewFeature from '$lib/components/omnibar/OmniNewFeature.svelte'
// CONTEXT
const omniCtx = getOmniCtx()

// EFFECTS

// Reopen the tray if user starts typing while the tray is closed
$effect(() => {
  if (omniCtx.state.searchTerm !== '' && !omniCtx.state.isTrayOpen) {
    omniCtx.openTray()
  }
})
</script>

<div
  class="relative z-50 col-start-1 row-start-1 flex min-h-16 w-full items-center justify-between border-b-3 border-base-300 bg-black w-120:min-h-14 w-120:rounded-lg w-120:border-3 w-192:min-h-12"
  use:clickOutside={() => {
    if (omniCtx.state.isTrayOpen) {
      omniCtx.closeTray();
    }
  }}
>
  <input
    id="omni-search-bar"
    type="text"
    bind:value={omniCtx.state.searchTerm}
    placeholder={m.omni__placeholder()}
    onfocus={() => omniCtx.openTray()}
    class="input h-12 w-full rounded-lg border-0 border-base-200 bg-black pl-6 pr-10 text-sm caret-current focus:outline-none"
    use:focusOnSlash={() => void null}
    use:selectOnEnter={() => omniCtx.selectFirstResult()}
    use:handleEscape={() => omniCtx.clearSearchOrCloseTray()}
  >
  <div class="absolute inset-y-0 right-2 flex items-center pr-3">
    <Icon src={MagnifyingGlass} class="h-6 w-6" />
  </div>
</div>

{#if omniCtx.state.isTrayOpen}
  <div
    class="mx-3 mt-0 overflow-hidden rounded-b-xl border-2 border-t-0 border-base-200 bg-black shadow-lg"
    transition:slide={{ duration: 200 }}
  >
    <OmniResults />
    <OmniNewFeature />
  </div>
{/if}
