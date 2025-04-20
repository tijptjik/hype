<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { XCircle, QueueList } from '@steeze-ui/heroicons';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
import { getOmniContext } from '$lib/context/omni.svelte';
// I18N
import { getI18nValue } from '$lib/i18n';

// CONTEXT
const mapContext = getMapContext();
const omniContext = getOmniContext();

// DERIVED -- Titles
let collectionTitle = $derived(getI18nValue(mapContext.getActiveCollection(), 'name'));
let featureTitle = $derived(getI18nValue(mapContext.getActiveFeature(), 'title'));

// DERIVED -- Collection Index and Size
let index = $derived(omniContext.navIndex + 1);
let collectionSize = $derived(mapContext.getActiveCollection()?.items.length);

// DERIVED -- Mode
let collectionMode = $derived(omniContext.state.mode);
let isNotFeatureMode = $derived(collectionMode !== 'feature');

// SCROLL STATE
type ScrollState = {
  container: HTMLSpanElement | null;
  content: HTMLSpanElement | null;
  needsScroll: boolean;
  isScrolling: boolean;
  scrollWidth: number;
  containerWidth: number;
};

let featureScroll = $state<ScrollState>({
  container: null,
  content: null,
  needsScroll: false,
  isScrolling: false,
  scrollWidth: 0,
  containerWidth: 0
});

let collectionScroll = $state<ScrollState>({
  container: null,
  content: null,
  needsScroll: false,
  isScrolling: false,
  scrollWidth: 0,
  containerWidth: 0
});

function setupScroll(state: ScrollState) {
  if (!state.container || !state.content) return;

  // check if a previous duplicate exists
  const previousDuplicate = state.container.querySelector('span:not(:first-child)');
  if (previousDuplicate) {
    previousDuplicate.remove();
  }

  // Get the actual content width without any constraints
  state.content.style.width = 'auto';
  state.content.style.position = 'absolute';
  state.scrollWidth = state.content.offsetWidth;

  // Reset styles and get container width
  state.content.style.width = '';
  state.content.style.position = '';
  state.containerWidth = state.container.offsetWidth;

  state.needsScroll = state.scrollWidth > state.containerWidth;

  if (state.needsScroll && !state.isScrolling) {
    startScrollAnimation(state);
  }
}

async function startScrollAnimation(state: ScrollState) {
  if (!state.needsScroll || !state.content || !state.container) return;

  state.isScrolling = true;

  while (state.needsScroll) {
    // Create the duplicate element for seamless loop
    const duplicate = state.content.cloneNode(true) as HTMLSpanElement;
    state.container.appendChild(duplicate);

    // Initial pause at start position
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Calculate scroll duration based on content width
    const scrollDistance = state.scrollWidth;
    const duration = (scrollDistance / 45) * 1000;

    // Scroll both elements
    state.content.style.transition = `transform ${duration}ms linear`;
    duplicate.style.transition = `transform ${duration}ms linear`;
    state.content.style.transform = `translateX(-100%)`;
    duplicate.style.transform = `translateX(-100%)`;

    // Wait for scroll to complete
    await new Promise((resolve) => setTimeout(resolve, duration));

    // Clean up and prepare for next cycle
    state.content.style.transition = 'none';
    state.content.style.transform = 'translateX(0)';
    duplicate.remove();
  }
}

// Watch for content changes
$effect(() => {
  featureTitle;
  requestAnimationFrame(() => setupScroll(featureScroll));
});

$effect(() => {
  collectionTitle;
  requestAnimationFrame(() => setupScroll(collectionScroll));
});

// Add resize observers
$effect(() => {
  const observer = new ResizeObserver(() => {
    setupScroll(featureScroll);
    setupScroll(collectionScroll);
  });

  if (featureScroll.container) observer.observe(featureScroll.container);
  if (collectionScroll.container) observer.observe(collectionScroll.container);

  return () => observer.disconnect();
});

// Cleanup on destroy
onDestroy(() => {
  featureScroll.needsScroll = false;
  featureScroll.isScrolling = false;
  collectionScroll.needsScroll = false;
  collectionScroll.isScrolling = false;
});
</script>

<div
  class="flex w-full select-none justify-between gap-1 overflow-hidden py-0 transition-[height] {isNotFeatureMode
    ? 'px-0'
    : 'px-6'}">
  <div
    class="min-w-0 flex-1 overflow-hidden transition-[height]"
    onclick={() => omniContext.toggleCard()}>
    <div class="flex items-start gap-3">
      {#if isNotFeatureMode}
        <button
          class="btn btn-ghost btn-sm m-0 h-auto p-0 pt-2 hover:bg-transparent hover:text-base-content/80 focus:outline-none"
          onclick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            omniContext.closeCard();
            omniContext.toggleTray(e);
          }}>
          <Icon src={QueueList} class="h-6 w-6 stroke-2" />
        </button>
      {/if}
      <div
        class="flex min-w-0 flex-1 -translate-y-0.5 flex-col overflow-hidden transition-[height] duration-300">
        <div
          class="title relative h-[22px] w-full {collectionScroll.needsScroll
            ? 'overflow-hidden'
            : 'overflow-visible'} whitespace-nowrap"
          bind:this={collectionScroll.container}>
          <span
            class="inline-block pr-3 text-xs text-base-content/60"
            bind:this={collectionScroll.content}>
            {collectionTitle}
            {#if isNotFeatureMode}
              <span>({index} of {collectionSize})</span>
            {/if}
          </span>
        </div>
        <div
          class="title relative h-6 w-full {featureScroll.needsScroll
            ? 'overflow-hidden'
            : 'overflow-visible'} whitespace-nowrap"
          bind:this={featureScroll.container}>
          <span class="inline-block pr-2 font-medium" bind:this={featureScroll.content}>
            {featureTitle}
          </span>
        </div>
      </div>
    </div>
  </div>

  <button
    class="btn btn-ghost btn-sm m-0 h-auto flex-none p-0 hover:bg-transparent hover:text-base-content/80"
    onclick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      omniContext.close();
    }}>
    <Icon
      src={XCircle}
      class="h-10 w-10 transition-transform duration-300 {omniContext.state.isCardOpen
        ? 'rotate-90'
        : 'rotate-0'}" />
  </button>
</div>

<style>
.title {
  max-width: 100%;
  position: relative;
}

.title.overflow-hidden span::after {
  color: white;
  content: ' ~';
  padding-left: 10px;
  display: inline-block;
}

.title.overflow-hidden {
  mask-image: linear-gradient(
    to right,
    black 0px,
    black calc(100% - 10px),
    transparent
  );
}

/* Ensure smooth animation */
.title span {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  transform-style: preserve-3d;
  -webkit-transform-style: preserve-3d;
}
</style>
