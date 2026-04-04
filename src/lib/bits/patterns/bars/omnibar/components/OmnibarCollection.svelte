<script lang="ts">
import { slide } from 'svelte/transition'
// BITS
import { Button } from '$lib/bits'
// I18N
import { m } from '$lib/i18n'
// ICONS
import XMark from 'virtual:icons/lucide/x'
// STYLES
import {
  getOmnibarCollectionPanelClasses,
  OMNIBAR_COLLECTION_FOOTER_CLASSES,
  OMNIBAR_COLLECTION_ITEM_CLASSES,
  OMNIBAR_COLLECTION_ITEM_TITLE_CLASSES,
  OMNIBAR_COLLECTION_LIST_CLASSES,
  OMNIBAR_COLLECTION_SCROLL_AREA_CLASSES,
} from '../omnibar.styles'
// TYPES
import type { OmnibarCollectionProps } from './omnibarPrimitives.types'

const COLLECTION_SLIDE_DURATION_MS = 300

let {
  mode = 'results',
  items = [],
  hasElevatedChrome = false,
  effectiveAppMainWidth = 0,
  currentIndex = -1,
  navTitle = '',
  onSelectIndex,
  onCloseTray,
}: OmnibarCollectionProps = $props()

const isNavigationMode = $derived(mode === 'navigation')
const panelClasses = $derived(
  getOmnibarCollectionPanelClasses({ hasElevatedChrome, effectiveAppMainWidth }),
)
const scrollAreaMaxHeight = $derived(
  mode === 'navigation'
    ? 'calc(var(--omni-available-height, 100dvh) - 7rem)'
    : 'calc(var(--omni-available-height, 100dvh) - 4rem)',
)
const panelSlideDelay = 0

let listContainer: HTMLUListElement | null = $state(null)
let scrollArea: HTMLDivElement | null = $state(null)
let hasSyncedOpenScrollPosition = $state(false)

function handleItemClick(index: number): void {
  onSelectIndex?.(index)
}

function handleCloseTrayClick(): void {
  onCloseTray?.()
}

function getIndicatorOpacities(distance: number): {
  primaryOpacity: number
  whiteOpacity: number
} {
  const primaryOpacity = Math.max(0, Math.min(100, (6 - distance) * 20))

  return {
    primaryOpacity,
    whiteOpacity: 100 - primaryOpacity,
  }
}

// Keep the active item in view without triggering browser-managed scroll behavior.
function syncScrollPosition(behavior: ScrollBehavior): void {
  if (!scrollArea || !listContainer || currentIndex < 0) return

  const currentItem = listContainer.children[currentIndex]
  if (!(currentItem instanceof HTMLElement)) return

  const itemTop = currentItem.offsetTop
  const itemBottom = itemTop + currentItem.offsetHeight
  const viewTop = scrollArea.scrollTop
  const viewBottom = viewTop + scrollArea.clientHeight

  let nextScrollTop: number | null = null

  if (itemTop < viewTop) {
    nextScrollTop = itemTop
  } else if (itemBottom > viewBottom) {
    nextScrollTop = itemBottom - scrollArea.clientHeight
  }

  if (nextScrollTop === null) return

  scrollArea.scrollTo({
    top: nextScrollTop,
    behavior,
  })
}

$effect(() => {
  if (!isNavigationMode) {
    hasSyncedOpenScrollPosition = false
    return
  }

  syncScrollPosition(hasSyncedOpenScrollPosition ? 'smooth' : 'auto')
  hasSyncedOpenScrollPosition = true
})
</script>

<div
  class={panelClasses}
  transition:slide={{
    duration: COLLECTION_SLIDE_DURATION_MS,
    axis: 'y',
    delay: panelSlideDelay
  }}
>
  <div
    bind:this={scrollArea}
    class={OMNIBAR_COLLECTION_SCROLL_AREA_CLASSES}
    style="max-height: {scrollAreaMaxHeight};"
  >
    {#if items.length === 0}
      <div class="p-4 text-center text-base-content/60">{m.omni__no_results()}</div>
    {:else}
      <ul class={OMNIBAR_COLLECTION_LIST_CLASSES} bind:this={listContainer}>
        {#each items as item, index}
          {@const indicatorOpacities = getIndicatorOpacities(Math.abs(currentIndex - index))}
          <li
            class={OMNIBAR_COLLECTION_ITEM_CLASSES}
            onclick={() => handleItemClick(index)}
          >
            {#if isNavigationMode}
              <div class="relative h-2 w-2 rounded-full">
                <div
                  class="absolute left-0 top-0 h-2 w-2 rounded-full bg-primary group-hover:opacity-100"
                  style="opacity: {indicatorOpacities.primaryOpacity}%"
                ></div>
                <div
                  class="absolute right-0 top-0 h-2 w-2 rounded-full bg-white/90 group-hover:opacity-100"
                  style="opacity: {indicatorOpacities.whiteOpacity}%"
                ></div>
              </div>
            {/if}
            <span class={OMNIBAR_COLLECTION_ITEM_TITLE_CLASSES}>
              {'label' in item ? item.label : ''}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  {#if isNavigationMode}
    <div class={OMNIBAR_COLLECTION_FOOTER_CLASSES}>
      <span class="text-xs uppercase tracking-wider text-base-content/60">
        {navTitle}
      </span>
      <Button
        text={m.admin__project_license_close()}
        style="transparent"
        modifier="circle"
        hideLabel={true}
        iconComponent={XMark}
        iconClasses="h-5 w-5"
        class="text-base-content/70"
        attrs={{ title: m.admin__project_license_close() }}
        onClick={handleCloseTrayClick}
      />
    </div>
  {/if}
</div>
