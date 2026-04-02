<script lang="ts">
import { slide } from 'svelte/transition'
// ACTIONS
import { clickOutside, focusOnSlash, handleEscape, selectOnEnter } from '$lib/actions'
// BITS
import { Icon } from '$lib/bits'
// COMPONENTS
import OmnibarNewFeature from './OmnibarNewFeature.svelte'
import OmnibarResults from './OmnibarResults.svelte'
// CONTEXT
import { getOmniCtx } from '$lib/context/omni.svelte'
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// I18N
import { m } from '$lib/i18n'
// ICONS
import MagnifyingGlass from 'virtual:icons/lucide/search'
// STYLES
import { getOmnibarResultsClasses, getOmnibarSearchBarClasses } from '../omnibar.styles'

const omniCtx = getOmniCtx()
const responsiveCtx = getResponsiveCtx()

const hasElevatedChrome = $derived(responsiveCtx.hasElevatedChrome)
const searchBarClasses = $derived(getOmnibarSearchBarClasses(hasElevatedChrome))
const resultsClasses = $derived(getOmnibarResultsClasses(hasElevatedChrome))

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
    in:slide={{ duration: 200 }}
    out:slide={{ duration: 160 }}
  >
    <div class="min-h-0 flex-1 overflow-y-auto"><OmnibarResults /></div>
    <OmnibarNewFeature />
  </div>
{/if}
