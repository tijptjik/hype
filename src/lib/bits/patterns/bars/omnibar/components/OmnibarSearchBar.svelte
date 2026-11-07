<script lang="ts">
import { slide } from 'svelte/transition'
// ACTIONS
import {
  clickOutside,
  focusOnSlash,
  handleEscape,
  selectOnEnter,
} from '#lib/actions.js'
// BITS
import { Icon } from '#lib/bits/index.js'
// COMPONENTS
import OmnibarNewFeature from './OmnibarNewFeature.svelte'
import OmnibarResults from './OmnibarResults.svelte'
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import MagnifyingGlass from 'virtual:icons/proicons/search'
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
const updating = $derived(
  search.isTrayOpen &&
    (search.updating ?? search.sections.some(section => section.loading)),
)
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
        class="bg-panel text-base-content placeholder:text-muted-foreground h-12 w-full min-w-0 appearance-none rounded-lg border-0 pr-20 pl-6 text-sm caret-current focus:outline-none"
        use:focusOnSlash={() => void null}
        use:selectOnEnter={search.onSelectFirstResult}
        use:handleEscape={search.onClearSearchOrCloseTray}
      >
      <div
        class="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-3 pr-3"
      >
        <span
          role="status"
          class="flex size-4 items-center justify-center transition-opacity duration-150 motion-reduce:transition-none {updating
            ? 'opacity-100'
            : 'opacity-0'}"
        >
          <span
            aria-hidden="true"
            class="border-primary/20 border-t-primary size-3 rounded-full border-2 motion-safe:animate-spin"
          ></span>
          <span class="sr-only">{updating ? m.resource_loading() : ''}</span>
        </span>
        <Icon src={MagnifyingGlass} tone="base" class="h-6 w-6" />
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
          <OmnibarResults sections={search.sections} {updating} />
        </div>
        <OmnibarNewFeature onCreateFeature={search.onCreateFeature} />
      </div>
    </div>
  {/if}
</div>
