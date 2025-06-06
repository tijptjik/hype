<script lang="ts">
// TRANSITIONS
import { slide, fade } from 'svelte/transition';
import { cubicInOut } from 'svelte/easing';
// CONTEXT
import { getMapCtx } from '$lib/context/map.svelte';
import { getOmniContext } from '$lib/context/omni.svelte';
// I18N
import { getI18n } from '$lib/i18n';
import { m } from '$lib/i18n';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { XMark } from '@steeze-ui/heroicons';

// TYPES
import type { Feature } from '$lib/types';

type OmniCollectionProps = {
  mode: 'results' | 'navigation';
  items: Feature[];
};

// PROPS
let {
  mode = 'results', // 'results' | 'navigation'
  items = []
}: OmniCollectionProps = $props();

// CONTEXT
const omniCtx = getOmniContext();
const mapCtx = getMapCtx();
const userPreferences = $derived(mapCtx.getUserPreferences());

// STATE
let currentIndex = $derived(
  mapCtx.state.active.collection?.items.findIndex(
    (item) => item.id === mapCtx.state.active.feature?.id
  ) || -1
);
let listContainer: HTMLUListElement | null = $state(null);

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
    omniCtx.toggleTray(event);
  }
  mapCtx.navToIndex(index, { isCardOpen: omniCtx.state.isCardOpen });
  omniCtx.openCard();
}

// EFFECTS
$effect(() => {
  if (mode === 'navigation' && listContainer) {
    const items = listContainer.children;
    if (items[currentIndex]) {
      (items[currentIndex] as HTMLElement).scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }
});
</script>

<div
  class="absolute left-3 right-3 top-0 z-50 flex w-auto select-none flex-col rounded-b-lg border-t-0 border-base-300 bg-base-200 p-0 shadow-xl shadow-blue-500/100 shadow-blue-500/50"
  transition:slide={{ duration: 200, axis: 'y', delay: 300, easing: cubicInOut }}>
  <div class="max-h-[260px] overflow-y-auto px-4 pb-2 pt-1.5">
    {#if items.length === 0}
      <div class="p-4 text-center text-base-content/60">
        {m.omni__no_results()}
      </div>
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
            class="flex cursor-pointer items-center space-x-2"
            onclick={(e) => handleItemClick(e, i)}>
            {#if mode === 'navigation'}
              <div class="relative h-2 w-2 rounded-full">
                <div
                  class="absolute left-0 top-0 h-2 w-2 rounded-full bg-primary"
                  style="opacity: {primaryOpacity}%">
                </div>
                <div
                  class="absolute right-0 top-0 h-2 w-2 rounded-full bg-white"
                  style="opacity: {whiteOpacity}%">
                </div>
              </div>
            {/if}
            <span class="select-none pl-1 font-thin text-base-content"
              >{getI18n(itemId, 'title', userPreferences)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  {#if mode === 'navigation'}
    <div class="flex h-12 items-center justify-between rounded-b-lg bg-black px-4">
      <span class="text-xs uppercase tracking-wider text-base-content/60">
        {omniCtx.navTitle}
      </span>
      <Icon src={XMark} class="h-5 w-5" onclick={(e: Event) => omniCtx.toggleTray(e)} />
    </div>
  {/if}
</div>
