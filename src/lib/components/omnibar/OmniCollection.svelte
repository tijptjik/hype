<script lang="ts">
// TRANSITIONS
import { slide } from 'svelte/transition'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
// I18N
import { getI18n } from '$lib/i18n'
import { m } from '$lib/i18n'
// ICONS
import { Button } from '$lib/bits'
import XMark from 'virtual:icons/lucide/x'
// STYLES
import {
  OMNI_COLLECTION_FOOTER_CLASSES,
  OMNI_COLLECTION_ITEM_CLASSES,
  OMNI_COLLECTION_ITEM_TITLE_CLASSES,
  OMNI_COLLECTION_LIST_CLASSES,
  OMNI_COLLECTION_SCROLL_AREA_CLASSES,
  getOmniCollectionPanelClasses,
} from './OmniCollection.styles'
import type { Feature, FeatureFromCollection } from '$lib/db/zod/schema/feature.types'

const COLLECTION_OPEN_DELAY_MS = 2000
const COLLECTION_SLIDE_DURATION_MS = 300

type OmniCollectionProps = {
  mode: 'results' | 'navigation'
  items: (FeatureFromCollection | Feature)[]
  shouldFloatMobile?: boolean
}

// PROPS
let {
  mode = 'results', // 'results' | 'navigation'
  items = [],
  shouldFloatMobile = false,
}: OmniCollectionProps = $props()

// CONTEXT
const omniCtx = getOmniCtx()
const appCtx = getAppCtx()
const userPreferences = $derived(appCtx.getUserPreferences())
const isNavigationMode = $derived(mode === 'navigation')
const panelClasses = $derived(getOmniCollectionPanelClasses(shouldFloatMobile))

// STATE
let currentIndex = $derived(
  appCtx.state.active.collection?.items.findIndex(
    item => item.id === appCtx.state.active.feature?.id,
  ) ?? -1,
)
let listContainer: HTMLUListElement | null = $state(null)
let scrollAreaMaxHeight = $derived(
  mode === 'navigation'
    ? 'calc(var(--omni-available-height, 100dvh) - 7rem)'
    : 'calc(var(--omni-available-height, 100dvh) - 4rem)',
)
let panelSlideDelay = $derived(
  omniCtx.state.isCardOpen ? COLLECTION_SLIDE_DURATION_MS : 0,
)

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
  if (!isNavigationMode || !listContainer || currentIndex < 0) return

  const currentItem = listContainer.children[currentIndex]
  if (currentItem instanceof HTMLElement) {
    currentItem.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    })
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
    class={OMNI_COLLECTION_SCROLL_AREA_CLASSES}
    style="max-height: {scrollAreaMaxHeight};"
  >
    {#if items.length === 0}
      <div class="p-4 text-center text-base-content/60">{m.omni__no_results()}</div>
    {:else}
      <ul class={OMNI_COLLECTION_LIST_CLASSES} bind:this={listContainer}>
        {#each items as itemId, i}
          {@const indicatorOpacities = getIndicatorOpacities(Math.abs(currentIndex - i))}
          <li
            class={OMNI_COLLECTION_ITEM_CLASSES}
            onclick={(e) => handleItemClick(e, i)}
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
            <span class={OMNI_COLLECTION_ITEM_TITLE_CLASSES}>
              {getI18n(itemId, 'title', userPreferences)}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  {#if isNavigationMode}
    <div class={OMNI_COLLECTION_FOOTER_CLASSES}>
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
