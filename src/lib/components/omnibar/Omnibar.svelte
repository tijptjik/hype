<script lang="ts">
// CONTEXT
import { getOmniCtx } from '$lib/context/omni.svelte'
import { getAppCtx } from '$lib/context/app.svelte'
// COMPONENTS
import OmniSearchBar from './OmniSearchBar.svelte'
import OmniNavigationBar from './OmniNavigationBar.svelte'

// CONTEXT
const omniCtx = getOmniCtx()
const appCtx = getAppCtx()

let showSearch = $derived(omniCtx.state.mode === 'search')

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    omniCtx.close()
  }
}

// Calculate offset based on visible panels
let horizontalOffset = $derived(appCtx.getHorizontalOffset())
</script>

<div
  class="relative z-40 mt-0 shrink-0 grow-0 select-none overscroll-auto px-0 caret-transparent duration-300 w-120:mt-2 w-192:mt-6 w-192:px-4 w-320:mt-10 w-320:px-9"
  style="transform: translateX({horizontalOffset}px)"
  onkeydown={handleEscape}
>
  <div class="mx-auto min-w-[320px] max-w-120">
    <div
      class="grid grid-cols-1 grid-rows-1 rounded-none transition-[height] duration-300 w-120:rounded-lg"
    >
      {#if showSearch}
        <OmniSearchBar />
      {:else}
        <OmniNavigationBar />
      {/if}
    </div>
  </div>
</div>
