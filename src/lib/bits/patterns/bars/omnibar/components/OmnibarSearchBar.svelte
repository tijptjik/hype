<script lang="ts">
import { tick } from 'svelte'
import { slide } from 'svelte/transition'
// ACTIONS
import { fitSearchTray } from '../fitSearchTray'
import {
  clickOutside,
  focusOnSlash,
  handleEscape,
  selectOnEnter,
} from '#lib/actions.js'
// BITS
import Icon from '#lib/bits/custom/icon/Icon.svelte'
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

/** Navigate only result buttons that the fitted tray currently displays. */
function navigateResults(node: HTMLElement): { destroy: () => void } {
  async function onKeyDown(event: KeyboardEvent): Promise<void> {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const input = node.querySelector<HTMLInputElement>('#omni-search-bar')
    const isInput = target === input
    if (!isInput && !target.matches('[data-omni-result]')) return

    if (event.key === 'Escape' && !isInput) {
      event.preventDefault()
      event.stopPropagation()
      input?.focus()
      search.onClearSearchOrCloseTray()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    event.preventDefault()
    if (!search.isTrayOpen) {
      search.onOpenTray()
      await tick()
    }
    const results = [
      ...node.querySelectorAll<HTMLButtonElement>('[data-omni-result]'),
    ].filter(result => result.getClientRects().length > 0)
    if (!results.length) return
    const index = results.indexOf(target as HTMLButtonElement)
    const next =
      event.key === 'ArrowDown'
        ? (results[index + 1] ?? input)
        : index < 0
          ? results.at(-1)
          : (results[index - 1] ?? input)
    next?.focus()
  }
  node.addEventListener('keydown', onKeyDown)
  return { destroy: () => node.removeEventListener('keydown', onKeyDown) }
}
</script>

<div
  class="relative flex min-h-0 flex-col"
  use:navigateResults
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
        data-omni-tray
        use:fitSearchTray={{
          viewport: search.viewport,
          expanded: search.expanded,
          sections: search.sections,
        }}
        style="max-height: calc(var(--omni-available-height, 100dvh) - 4rem);"
        in:slide={{ duration: 200 }}
        out:slide={{ duration: 160 }}
      >
        <div data-omni-scroll class="min-h-0 flex-1 overflow-y-auto">
          <OmnibarResults sections={search.sections} {updating} />
        </div>
        <div data-omni-footer class="shrink-0">
          <OmnibarNewFeature onCreateFeature={search.onCreateFeature} />
        </div>
      </div>
    </div>
  {/if}
</div>
