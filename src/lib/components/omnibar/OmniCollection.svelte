<script lang="ts">
// TRANSITIONS
import { slide, fade } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
import { getOmniContext } from '$lib/context/omni.svelte';
// I18N
import * as m from '$lib/paraglide/messages';
import { getI18nValue } from '$lib/i18n';
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
const omniContext = getOmniContext();
const mapContext = getMapContext();

// STATE
let currentIndex = $derived(
  mapContext.state.active.collection?.items.findIndex(
    (item) => item.id === mapContext.state.active.feature?.id
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
    omniContext.toggleTray(event);
  }
  mapContext.navToIndex(index);
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
  class="absolute left-0 top-0 z-10 flex w-full select-none flex-col divide-neutral-800 rounded-b-lg border-2 border-t-0 border-base-200 bg-neutral-900 p-4"
  transition:slide={{ duration: 200, axis: 'y', delay: 150 }}>
  {#if mode === 'navigation'}
    <div class="flex items-center justify-between">
      <span class="text-xs uppercase tracking-wider text-base-content/60">
        {omniContext.navTitle}
      </span>
      <Icon
        src={XMark}
        class="h-5 w-5"
        onclick={(e: Event) => omniContext.toggleTray(e)} />
    </div>
  {/if}

  <div class="mt-2 max-h-[216px] overflow-y-auto pb-1">
    {#if items.length === 0}
      <div class="p-4 text-center text-base-content/60">
        {m.omni__no_results()}
      </div>
    {:else}
      <ul class="space-y-2" bind:this={listContainer}>
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
            onclick={(e) => handleItemClick(e, i)}
            transition:slide={{
              duration: 200,
              axis: 'y',
              easing: cubicOut
            }}>
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
            <span class="select-none text-base-content/60"
              >{getI18nValue(itemId, 'title')}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
