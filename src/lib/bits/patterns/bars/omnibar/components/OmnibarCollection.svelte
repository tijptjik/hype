<script lang="ts">
import { slide } from 'svelte/transition'
// BITS
import { Button } from '$lib/bits'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
// I18N
import { getI18n, m } from '$lib/i18n'
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

const COLLECTION_OPEN_DELAY_MS = 2000
const COLLECTION_SLIDE_DURATION_MS = 300

const omniCtx = getOmniCtx()
const appCtx = getAppCtx()

let {
  mode = 'results',
  items = [],
  hasElevatedChrome = false,
}: OmnibarCollectionProps = $props()

const userPreferences = $derived(appCtx.getUserPreferences())
const isNavigationMode = $derived(mode === 'navigation')
const panelClasses = $derived(getOmnibarCollectionPanelClasses(hasElevatedChrome))
const currentIndex = $derived(
  appCtx.state.active.collection?.items.findIndex(
    item => item.id === appCtx.state.active.feature?.id,
  ) ?? -1,
)
const scrollAreaMaxHeight = $derived(
  mode === 'navigation'
    ? 'calc(var(--omni-available-height, 100dvh) - 7rem)'
    : 'calc(var(--omni-available-height, 100dvh) - 4rem)',
)
const panelSlideDelay = $derived(
  omniCtx.state.isCardOpen ? COLLECTION_SLIDE_DURATION_MS : 0,
)

let listContainer: HTMLUListElement | null = $state(null)
let hasSyncedOpenScrollPosition = $state(false)

function handleItemClick(event: Event, index: number): void {
  if (isNavigationMode) {
    omniCtx.toggleTray(event)
  }

  omniCtx.navToIndex(index)

  setTimeout(() => {
    omniCtx.openCard()
  }, COLLECTION_OPEN_DELAY_MS)
}

function handleCloseTray(event: Event): void {
  omniCtx.toggleTray(event)
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

$effect(() => {
  if (!isNavigationMode || !omniCtx.state.isTrayOpen) {
    hasSyncedOpenScrollPosition = false
    return
  }

  if (!listContainer || currentIndex < 0) return

  const currentItem = listContainer.children[currentIndex]
  if (currentItem instanceof HTMLElement) {
    currentItem.scrollIntoView({
      behavior: hasSyncedOpenScrollPosition ? 'smooth' : 'auto',
      block: 'nearest',
    })
    hasSyncedOpenScrollPosition = true
  }
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
            onclick={event => handleItemClick(event, index)}
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
              {getI18n(item, 'title', userPreferences)}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  {#if isNavigationMode}
    <div class={OMNIBAR_COLLECTION_FOOTER_CLASSES}>
      <span class="text-xs uppercase tracking-wider text-base-content/60">
        {omniCtx.navTitle}
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
        onClick={handleCloseTray}
      />
    </div>
  {/if}
</div>
