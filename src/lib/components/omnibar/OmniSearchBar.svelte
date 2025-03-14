<script lang="ts">
// TRANSITIONS
import { slide } from 'svelte/transition';
// I18N
import * as m from '$lib/paraglide/messages';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { MagnifyingGlass } from '@steeze-ui/heroicons';
// TRANSITIONS
import { fade } from 'svelte/transition';
import { getOmniContext } from '$lib/context/omni.svelte';
// ACTIONS
import { clickOutside, focusOnSlash, handleEscape, selectOnEnter } from '$lib/actions';
// COMPONENTS
import OmniResults from '$lib/components/omnibar/OmniResults.svelte';

// CONTEXT
const omniContext = getOmniContext();

// EFFECTS

// Reopen the tray if user starts typing while the tray is closed
$effect(() => {
  if (omniContext.state.searchTerm !== '' && !omniContext.state.isTrayOpen) {
    omniContext.openTray();
  }
});
</script>

<div
  class="relative z-50 col-start-1 row-start-1 flex min-h-10 w-full items-center justify-between rounded-lg border-base-200 bg-black"
  use:clickOutside={() => {
    if (omniContext.state.isTrayOpen) {
      console.log('closing TRAY || from SEARCH BAR || Click Outside');
      omniContext.closeTray();
    }
  }}
  in:fade={{ duration: 150, delay: 150 }}
  out:fade={{ duration: 150 }}>
  <input
    id="omni-search-bar"
    type="text"
    bind:value={omniContext.state.searchTerm}
    placeholder={m.omni__placeholder()}
    onfocus={() => omniContext.openTray()}
    class="input h-12 w-full rounded-lg border-0 border-base-200 bg-black pl-6 pr-10 text-sm caret-current focus:outline-none"
    use:focusOnSlash={() => void null}
    use:selectOnEnter={() => omniContext.selectFirstResult()}
    use:handleEscape={() => omniContext.clearSearchOrCloseTray()} />
  <div class="absolute inset-y-0 right-2 flex items-center pr-3">
    <Icon src={MagnifyingGlass} class="h-6 w-6" />
  </div>
</div>

{#if omniContext.state.isTrayOpen}
  <div
    class="mt-2 overflow-hidden rounded-b-lg bg-black shadow-lg"
    transition:slide={{ duration: 200 }}>
    <OmniResults />
  </div>
{/if}
