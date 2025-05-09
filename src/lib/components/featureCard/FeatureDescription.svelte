<script lang="ts">
// Icons
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronDown, XMark } from '@steeze-ui/heroicons';
// I18N
import { getI18nValue } from '$lib/i18n';
// Types
import type { Feature } from '$lib/types';

// STATE : PROPS
let { feature }: { feature: Feature } = $props();

// STATE : LOCAL
let isExpanded = $state(false);
let isTransitioning = $state(false); // New state for managing animation phase
// svelte-ignore non_reactive_update
let descriptionEl: HTMLParagraphElement;
let hasOverflow = $state(false);

// Constants for heights
const collapsedHeight = '3rem'; // Equivalent to h-10, for ~2 lines of text-sm
const expandedHeight = 'auto'; // Fixed expanded height
const transitionDuration = 300; // ms, matches duration-300

function updateOverflowState() {
  if (descriptionEl && descriptionEl.parentElement) {
    if (!isExpanded && !isTransitioning) {
      // Only check overflow when fully collapsed
      const textAreaClientHeight = descriptionEl.parentElement.clientHeight;
      hasOverflow = descriptionEl.scrollHeight > textAreaClientHeight;
    }
  } else {
    hasOverflow = false;
  }
}

$effect(() => {
  const rafId = requestAnimationFrame(updateOverflowState);
  return () => cancelAnimationFrame(rafId);
});

function toggleExpand() {
  if (isExpanded) {
    // Start collapsing
    isExpanded = false;
    isTransitioning = true;
    setTimeout(() => {
      isTransitioning = false;
      if (descriptionEl) {
        descriptionEl.scrollTo(0, 0); // Scroll to top after collapse animation
      }
      // No need to call updateOverflowState here as $effect will catch isTransitioning change
    }, transitionDuration);
  } else {
    // Start expanding
    isTransitioning = false; // Ensure this is false if toggled rapidly
    isExpanded = true;
  }
}
</script>

<svelte:window on:resize={updateOverflowState} />

{#if (getI18nValue(feature, 'description')?.length ?? 0) > 0}
  <div
    class="flex-grow-1 relative z-10 my-0 flex min-h-12 basis-auto flex-col bg-black caret-transparent {isExpanded ||
    isTransitioning
      ? 'flex-shrink-0'
      : 'flex-shrink-1'}">
    <div
      class="flex-grow-1 flex-shrink-1 relative min-h-0
        bg-black px-3 py-2 transition-all
        ease-in-out w-100:px-6
        {isExpanded || isTransitioning
        ? 'flex-shrink-0 rounded-b-lg pb-4 shadow-lg' // Absolute positioning during expansion and transition
        : 'flex-shrink-1 h-auto overflow-hidden'}
      "
      style="padding-right: {hasOverflow || isExpanded || isTransitioning
        ? '3rem'
        : '0.75rem'}; /* pr-12 if button visible, else pr-3 */
             mask-image: {!isExpanded && !isTransitioning && hasOverflow
        ? 'linear-gradient(to bottom, black 70%, transparent 100%)'
        : 'none'};
             transition-duration: {transitionDuration}ms;
            ">
      <p
        bind:this={descriptionEl}
        class="scrollbar-thin pointer-events-auto h-auto overscroll-none bg-black text-sm font-thin tracking-tight text-gray-300
               {isExpanded || isTransitioning ? 'overflow-y-auto' : 'overflow-hidden'}">
        {@html getI18nValue(feature, 'description')}
      </p>
    </div>

    {#if hasOverflow || isExpanded || isTransitioning}
      <button
        class="pointer-events-auto absolute right-3 top-2 z-30 flex h-7 w-7 items-center justify-center rounded-full bg-base-300/80 text-white backdrop-blur-sm transition-all duration-200 hover:bg-black/90"
        onclick={toggleExpand}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? 'Collapse description' : 'Expand description'}>
        <Icon
          src={isExpanded ? XMark : ChevronDown}
          class="h-5 w-5 transition-transform duration-200" />
      </button>
    {/if}
  </div>
{/if}
