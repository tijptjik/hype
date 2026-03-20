<script lang="ts">
// TRANSITIONS
import { slide, fade } from 'svelte/transition'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
// I18N
import { getI18n } from '$lib/i18n'
import { m } from '$lib/i18n'
// ICONS
import Icon from '$lib/components/common/Icon.svelte'
import XMark from 'virtual:icons/lucide/x'
import type { Feature, FeatureFromCollection } from '$lib/db/zod/schema/feature.types'

// TYPES

type OmniCollectionProps = {
  mode: 'results' | 'navigation'
  items: (FeatureFromCollection | Feature)[]
}

// PROPS
let {
  mode = 'results', // 'results' | 'navigation'
  items = [],
}: OmniCollectionProps = $props()

// CONTEXT
const omniCtx = getOmniCtx()
const appCtx = getAppCtx()
const userPreferences = $derived(appCtx.getUserPreferences())

// STATE
let currentIndex = $derived(
  appCtx.state.active.collection?.items.findIndex(
    item => item.id === appCtx.state.active.feature?.id,
  ) || -1,
)
let listContainer: HTMLUListElement | null = $state(null)

// HANDLERS
// function handleKeydown(event: KeyboardEvent) {
//   if (mode !== 'navigation') return;

//   if (event.key === 'ArrowUp') {
//     event.preventDefault();
//     currentIndex = Math.max(0, currentIndex - 1);
//   } else if (event.key === 'ArrowDown') {
//     event.preventDefault();
//     currentIndex = Math.min(items.length - 1, currentIndex + 1);
//   }
// }

function handleItemClick(event: Event, index: number) {
  if (mode === 'navigation') {
    omniCtx.toggleTray(event)
  }
  omniCtx.navToIndex(index)
  setTimeout(() => {
    omniCtx.openCard()
  }, 2000)
}

// GLOW COLOR HELPER
const getGlowColor = (): string => {
  return 'rgba(240, 77, 127, 0.15)' // primary: '#F04D7F'
}

// EFFECTS
$effect(() => {
  if (mode === 'navigation' && listContainer) {
    const items = listContainer.children
    if (items[currentIndex]) {
      ;(items[currentIndex] as HTMLElement).scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }
  }
})
</script>

<div
  class="absolute left-3 right-3 top-0 z-50 flex w-auto select-none flex-col rounded-b-lg border-2 border-t-0 border-primary bg-black p-0 shadow shadow-base-100/50"
  style="box-shadow: 
    -8px 0 8px {getGlowColor()},
    8px 0 8px {getGlowColor()},
    0 8px 16px {getGlowColor()}, 
    0 12px 24px {getGlowColor()},
    0 4px 8px rgba(0, 0, 0, 0.3);"
  transition:slide={{
    duration: 300,
    axis: 'y',
    delay: omniCtx.state.isCardOpen ? 300 : 0
  }}
>
  <div class="max-h-65 overflow-y-auto px-4 pb-2 pt-1.5">
    {#if items.length === 0}
      <div class="p-4 text-center text-base-content/60">{m.omni__no_results()}</div>
    {:else}
      <ul class="space-y-2 overscroll-none" bind:this={listContainer}>
        {#each items as itemId, i}
          {@const isVisible =
            mode === 'navigation'
              ? i >= Math.max(0, currentIndex - 3) &&
                i <= Math.min(items.length - 1, currentIndex + 3)
              : true}
          {@const distance = Math.abs(currentIndex - i)}
          {@const primaryOpacity = Math.max(0, Math.min(100, (6 - distance) * 20))}
          {@const whiteOpacity = 100 - primaryOpacity}
          <li
            class="group flex cursor-pointer items-center space-x-2"
            onclick={(e) => handleItemClick(e, i)}
          >
            {#if mode === 'navigation'}
              <div class="relative h-2 w-2 rounded-full">
                <div
                  class="absolute left-0 top-0 h-2 w-2 rounded-full bg-primary group-hover:bg-primary group-hover:opacity-100"
                  style="opacity: {primaryOpacity}%"
                ></div>
                <div
                  class="absolute right-0 top-0 h-2 w-2 rounded-full bg-white group-hover:bg-primary group-hover:opacity-100"
                  style="opacity: {whiteOpacity}%"
                ></div>
              </div>
            {/if}
            <span
              class="select-none pl-2 text-[0.92rem] font-medium text-base-content/80"
              style="font-weight: 300;"
              >{getI18n(itemId, 'title', userPreferences)}</span
            >
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  {#if mode === 'navigation'}
    <div
      class="flex h-12 items-center justify-between rounded-b-lg border-t-2 border-primary bg-black px-4"
      style="box-shadow: 
        inset 0 2px 4px {getGlowColor()},
        inset 0 1px 2px {getGlowColor()};"
    >
      <span class="text-xs uppercase tracking-wider text-base-content/60">
        {omniCtx.navTitle}
      </span>
      <Icon src={XMark} class="h-5 w-5" onclick={(e: Event) => omniCtx.toggleTray(e)} />
    </div>
  {/if}
</div>
