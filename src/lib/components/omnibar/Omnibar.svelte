<script lang="ts">
// CONTEXT
import { getOmniCtx } from '$lib/context/omni.svelte'
import { getAppCtx } from '$lib/context/app.svelte'
// COMPONENTS
import OmniSearchBar from './OmniSearchBar.svelte'
import OmniNavigationBar from './OmniNavigationBar.svelte'
// STYLES
import {
  OMNIBAR_ROOT_CLASSES,
  OMNIBAR_SURFACE_CLASSES,
  OMNIBAR_WIDTH_CONTAINER_CLASSES,
} from './omnibar.styles'

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
  class={OMNIBAR_ROOT_CLASSES}
  style="transform: translateX({horizontalOffset}px)"
  onkeydown={handleEscape}
>
  <div class={OMNIBAR_WIDTH_CONTAINER_CLASSES}>
    <div class={OMNIBAR_SURFACE_CLASSES}>
      {#if showSearch}
        <OmniSearchBar />
      {:else}
        <OmniNavigationBar />
      {/if}
    </div>
  </div>
</div>
