<script lang="ts">
// CONTEXT
import { getOmniCtx } from '$lib/context/omni.svelte'
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
import { getAppMenuViewportState } from '$lib/bits/patterns/bars/appMenu/appMenu.constants'
// COMPONENTS
import OmniSearchBar from './OmniSearchBar.svelte'
import OmniNavigationBar from './OmniNavigationBar.svelte'
// STYLES
import {
  OMNIBAR_WIDTH_CONTAINER_CLASSES,
  getOmnibarRootClasses,
  getOmnibarSurfaceClasses,
} from './omnibar.styles'

// CONTEXT
const omniCtx = getOmniCtx()
const responsiveCtx = getResponsiveCtx()
const OMNIBAR_BOTTOM_GUTTER_PX = 24

let showSearch = $derived(omniCtx.state.mode === 'search')
let viewportState = $derived(
  getAppMenuViewportState(responsiveCtx.window.width, responsiveCtx.window.height),
)
let shouldFloatMobile = $derived(
  viewportState.isMobileMenu && !viewportState.isIconOnlyMenu,
)
let availableViewportHeight = $derived(
  Math.max(
    160,
    responsiveCtx.visibleWindowHeight -
      responsiveCtx.menuClearanceHeight -
      OMNIBAR_BOTTOM_GUTTER_PX,
  ),
)

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    omniCtx.close()
  }
}

let horizontalOffset = $derived(responsiveCtx.getAppMainOffsetX())
let effectiveAppMainWidth = $derived(responsiveCtx.getEffectiveAppMainWidth())
let rootClasses = $derived(getOmnibarRootClasses(shouldFloatMobile))
let surfaceClasses = $derived(getOmnibarSurfaceClasses(shouldFloatMobile))
</script>

<div
  class={rootClasses}
  style="transform: translateX({horizontalOffset}px); --omni-available-height: {availableViewportHeight}px; --omni-effective-main-width: {effectiveAppMainWidth}px;"
  onkeydown={handleEscape}
>
  <div class={OMNIBAR_WIDTH_CONTAINER_CLASSES}>
    <div class={surfaceClasses}>
      {#if showSearch}
        <OmniSearchBar />
      {:else}
        <OmniNavigationBar />
      {/if}
    </div>
  </div>
</div>
