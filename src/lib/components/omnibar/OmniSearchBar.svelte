<script lang="ts">
// TRANSITIONS
import { slide } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
import { getAppMenuViewportState } from '$lib/bits/patterns/bars/appMenu/appMenu.constants'
// ICONS
import { Icon } from '$lib/bits'
import MagnifyingGlass from 'virtual:icons/lucide/search'
import { getOmniCtx } from '$lib/context/omni.svelte'
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// ACTIONS
import { clickOutside, focusOnSlash, handleEscape, selectOnEnter } from '$lib/actions'
// COMPONENTS
import OmniResults from '$lib/components/omnibar/OmniResults.svelte'
import OmniNewFeature from '$lib/components/omnibar/OmniNewFeature.svelte'
// STYLES
import { getOmnibarResultsClasses, getOmnibarSearchBarClasses } from './omnibar.styles'
// CONTEXT
const omniCtx = getOmniCtx()
const responsiveCtx = getResponsiveCtx()
const viewportState = $derived(
  getAppMenuViewportState(responsiveCtx.window.width, responsiveCtx.window.height),
)
const shouldFloatMobile = $derived(
  viewportState.isMobileMenu && !viewportState.isIconOnlyMenu,
)
const searchBarClasses = $derived(getOmnibarSearchBarClasses(shouldFloatMobile))
const resultsClasses = $derived(getOmnibarResultsClasses(shouldFloatMobile))

// EFFECTS

// Reopen the tray if user starts typing while the tray is closed
$effect(() => {
  if (omniCtx.state.searchTerm !== '' && !omniCtx.state.isTrayOpen) {
    omniCtx.openTray()
  }
})
</script>

<div
  class={searchBarClasses}
  use:clickOutside={() => {
    if (omniCtx.state.isTrayOpen) {
      omniCtx.closeTray()
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
    class={resultsClasses}
    style="max-height: calc(var(--omni-available-height, 100dvh) - 4rem);"
    transition:slide={{ duration: 200 }}
  >
    <div class="min-h-0 flex-1 overflow-y-auto"><OmniResults /></div>
    <OmniNewFeature />
  </div>
{/if}
