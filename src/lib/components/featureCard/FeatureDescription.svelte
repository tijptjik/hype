<script lang="ts">
// Icons
import Icon from '$lib/components/common/Icon.svelte';
import { Star, ChevronDown, XMark } from '@steeze-ui/heroicons';
// I18N
import { getI18nValue } from '$lib/i18n';
// Types
import type { Feature } from '$lib/types';

// STATE : PROPS
let { feature }: { feature: Feature } = $props();

// STATE : LOCAL
let grade = $derived(
  feature.properties.find((p) => p.property.key === 'grade')?.value || ''
);
let isExpanded = $state(false);
let descriptionEl: HTMLParagraphElement;
let descriptionContainer: HTMLDivElement;
let hasOverflow = $state(false);
let initialHeight = $state(0);

// Check if content overflows
function checkOverflow() {
  if (descriptionEl) {
    hasOverflow = descriptionEl.scrollHeight > descriptionContainer.clientHeight;
  }
}

$effect(() => {
  checkOverflow();
  if (!isExpanded) {
    initialHeight = descriptionContainer.clientHeight;
  }
});

function toggleExpand() {
  isExpanded = !isExpanded;
  if (!isExpanded) {
    descriptionEl.scrollTo(0, 0);
  }
}
function getExpandedDescriptionHeight() {
  return `${initialHeight + 200 - 16}px`;
}
</script>

<svelte:window on:resize={checkOverflow} />

<div class="flex-grow-1 flex min-h-0 flex-col space-y-2 bg-black pb-2">
  <div class="flex items-center justify-between px-3 w-100:px-6">
    <h2 class="text-lg text-white">
      {getI18nValue(feature, 'title')}
    </h2>
    <div class="flex items-center gap-1">
      <Icon src={Star} class="h-6 w-6" theme="solid" />
      <span>{grade}/5</span>
    </div>
  </div>

  <div
    class="flex-shrink-1 relative z-10 mt-0 bg-black {isExpanded
      ? 'overflow-clip'
      : 'overflow-y-auto rounded-b-xl'}"
    bind:this={descriptionContainer}
    style="mask-image: linear-gradient(to bottom, black, black {!hasOverflow ||
    isExpanded
      ? '100%'
      : 'calc(100% - 12px)'}, transparent);">
    <p
      bind:this={descriptionEl}
      class="scrollbar-thin pointer-events-auto overscroll-none px-3 text-sm font-thin tracking-tight text-gray-300 w-100:px-6 {isExpanded
        ? 'overflow-y-auto'
        : 'overflow-clip pr-10'} transition-[max-height] duration-300 ease-in-out"
      style="max-height: {isExpanded ? getExpandedDescriptionHeight() : 'none'};">
      {@html getI18nValue(feature, 'description')}
    </p>

    {#if hasOverflow || isExpanded}
      <button
        class="pointer-events-auto sticky bottom-0 right-3 z-10 float-right flex h-7 w-7 -translate-y-1 items-center justify-center rounded-full bg-base-300 text-white backdrop-blur-sm transition-all duration-200 hover:bg-black/90"
        onclick={toggleExpand}>
        <Icon
          src={isExpanded ? XMark : ChevronDown}
          class="h-5 w-5 transition-transform duration-200" />
      </button>
    {/if}
  </div>
</div>
