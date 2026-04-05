<script lang="ts">
import { slide } from 'svelte/transition'
// ACTIONS
import { clickOutside, focusOnSlash, handleEscape, selectOnEnter } from '$lib/actions'
// BITS
import { Icon } from '$lib/bits'
// COMPONENTS
import OmnibarNewFeature from './OmnibarNewFeature.svelte'
import OmnibarResults from './OmnibarResults.svelte'
// I18N
import { m } from '$lib/i18n'
// ICONS
import MagnifyingGlass from 'virtual:icons/lucide/search'
// STYLES
import {
  getOmnibarResultsClasses,
  getOmnibarSearchBarClasses,
  getOmnibarSurfaceClasses,
} from '../omnibar.styles'
// TYPES
import type { OmnibarSearchBarProps } from './omnibarPrimitives.types'

let { search, hasElevatedChrome, effectiveAppMainWidth }: OmnibarSearchBarProps =
  $props()
const searchBarClasses = $derived(
  getOmnibarSearchBarClasses({ hasElevatedChrome, effectiveAppMainWidth }),
)
const resultsClasses = $derived(
  getOmnibarResultsClasses({ hasElevatedChrome, effectiveAppMainWidth }),
)
const surfaceClasses = $derived(
  getOmnibarSurfaceClasses({ hasElevatedChrome, effectiveAppMainWidth }),
)
</script>

<div
  class="relative flex min-h-0 flex-col"
  use:clickOutside={() => {
    if (search.isTrayOpen) {
      search.onCloseTray()
    }
  }}
>
  <div class={surfaceClasses}>
    <div class={searchBarClasses}>
      <input
        id="omni-search-bar"
        type="text"
        value={search.term}
        placeholder={m.omni__placeholder()}
        oninput={event =>
          search.onSearchTermChange((event.currentTarget as HTMLInputElement).value)}
        onfocus={search.onOpenTray}
        class="h-12 min-w-0 w-full appearance-none rounded-lg border-0 bg-black pl-6 pr-10 text-sm caret-current focus:outline-none"
        use:focusOnSlash={() => void null}
        use:selectOnEnter={search.onSelectFirstResult}
        use:handleEscape={search.onClearSearchOrCloseTray}
      >
      <div class="absolute inset-y-0 right-2 flex items-center pr-3">
        <Icon src={MagnifyingGlass} class="h-6 w-6" />
      </div>
    </div>
  </div>

  {#if search.isTrayOpen}
    <div class="pointer-events-none absolute inset-x-0 top-full z-40">
      <div
        class={resultsClasses}
        style="max-height: calc(var(--omni-available-height, 100dvh) - 4rem);"
        in:slide={{ duration: 200 }}
        out:slide={{ duration: 160 }}
      >
        <div class="min-h-0 flex-1 overflow-y-auto">
          <OmnibarResults sections={search.sections} />
        </div>
        <OmnibarNewFeature onCreateFeature={search.onCreateFeature} />
      </div>
    </div>
  {/if}
</div>
