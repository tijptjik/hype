<script lang="ts">
// SVELTE
import { onMount } from 'svelte';
// I18n
import { getI18n } from '$lib/i18n';
import { m } from '$lib/i18n';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { XCircle, QueueList } from '@steeze-ui/heroicons';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
import { getOmniContext } from '$lib/context/omni.svelte';
// TYPES
import type { Feature } from '$lib/types';

// CONTEXT
const appCtx = getAppCtx();
const omniCtx = getOmniContext();

// DERIVED -- Titles
let collectionTitle = $derived(
  omniCtx.isFeatureMode
    ? (() => {
        const feature = appCtx.getActiveFeature();
        return feature
          ? getI18n(feature, 'displayAddress', {
              ...appCtx.getUserPreferences(),
              allowMachineTranslation: true
            })
          : '';
      })()
    : (() => {
        const collection = appCtx.getActiveCollection();
        return collection
          ? getI18n(collection, 'name', appCtx.getUserPreferences(), m.place())
          : '';
      })()
);
let featureTitle = $derived(
  (() => {
    const feature = appCtx.getActiveFeature();
    return feature ? getI18n(feature, 'title', appCtx.getUserPreferences()) : '';
  })()
);

// Reset scroll states immediately when titles change
$effect(() => {
  featureTitle;
  featureNeedsScroll = false;
  featureContentReady = false;
});

$effect(() => {
  collectionTitle;
  collectionNeedsScroll = false;
  collectionContentReady = false;
});
let newFeatureTitle = $derived(
  getI18n(
    appCtx.getNewFeature() as Feature,
    'title',
    appCtx.getUserPreferences(),
    m.day_chunky_okapi_cherish()
  )
);

// DERIVED -- Collection Index and Size
let index = $derived(omniCtx.navIndex + 1);
let collectionSize = $derived(appCtx.getActiveCollection()?.items.length);

// DERIVED -- Mode
let collectionMode = $derived(omniCtx.state.mode);
let isNotFeatureMode = $derived(collectionMode !== 'feature');
let isNewFeatureMode = $derived(collectionMode === 'new-feature');

// ═══════════════════════
// 1.0 SCROLLING TEXT :: STATE
// ═══════════════════════

let featureContainer: HTMLDivElement | null = $state(null);
let featureContent: HTMLSpanElement | null = $state(null);
let featureNeedsScroll = $state(false);
let featureContentReady = $state(false);

let collectionContainer: HTMLDivElement | null = $state(null);
let collectionContent: HTMLSpanElement | null = $state(null);
let collectionNeedsScroll = $state(false);
let collectionContentReady = $state(false);

// ═══════════════════════
// 2.0 SCROLLING TEXT :: MEASUREMENT
// ═══════════════════════

function checkScrollNeed(
  container: HTMLDivElement | null,
  content: HTMLSpanElement | null
): boolean {
  if (!container || !content) return false;

  const containerWidth = container.clientWidth;
  const contentWidth = content.scrollWidth;
  return contentWidth > containerWidth - 30; // Buffer for tilde
}

function checkScrollNeedForText(container: HTMLDivElement | null, text: string): boolean {
  if (!container || !text) return false;

  // Create a temporary element to measure the text width
  const tempElement = document.createElement('span');
  tempElement.style.position = 'absolute';
  tempElement.style.visibility = 'hidden';
  tempElement.style.whiteSpace = 'nowrap';
  tempElement.style.pointerEvents = 'none';
  
  // Copy styles from container to get accurate measurement
  const containerStyle = window.getComputedStyle(container);
  tempElement.style.fontSize = containerStyle.fontSize;
  tempElement.style.fontFamily = containerStyle.fontFamily;
  tempElement.style.fontWeight = containerStyle.fontWeight;
  
  tempElement.textContent = text;
  document.body.appendChild(tempElement);
  
  const textWidth = tempElement.scrollWidth;
  const containerWidth = container.clientWidth;
  
  document.body.removeChild(tempElement);
  
  return textWidth > containerWidth - 30; // Buffer for tilde
}

// ═══════════════════════
// 3.0 SCROLLING TEXT :: LIFECYCLE
// ═══════════════════════

onMount(() => {
  const checkAll = () => {
    featureNeedsScroll = checkScrollNeed(featureContainer, featureContent);
    collectionNeedsScroll = checkScrollNeed(collectionContainer, collectionContent);
  };

  checkAll();
  window.addEventListener('resize', checkAll);

  return () => {
    window.removeEventListener('resize', checkAll);
  };
});

// ═══════════════════════
// 4.0 SCROLLING TEXT :: ANIMATION RESET
// ═══════════════════════

function resetAnimation(container: HTMLDivElement | null) {
  if (!container) return;
  
  const wrapper = container.querySelector('.scroll-wrapper') as HTMLDivElement;
  if (!wrapper) return;
  
  // Force animation restart by removing and re-adding the animate class
  wrapper.classList.remove('animate');
  wrapper.style.animation = 'none';
  wrapper.style.transform = 'translateX(0)'; // Reset position to start
  
  // Force reflow
  wrapper.offsetHeight;
  
  // Re-add animation
  requestAnimationFrame(() => {
    wrapper.style.animation = '';
    wrapper.style.transform = ''; // Clear inline transform
    if (wrapper.classList.contains('needs-scroll')) {
      wrapper.classList.add('animate');
    }
  });
}

// ═══════════════════════
// 5.0 SCROLLING TEXT :: REACTIVE EFFECTS
// ═══════════════════════

$effect(() => {
  // Re-check when content changes and reset animation
  featureTitle;
  console.log(featureTitle);
  
  // Use the current reactive title to determine scroll need, not DOM content
  const currentTitle = isNewFeatureMode ? newFeatureTitle : featureTitle;
  const needsScroll = checkScrollNeedForText(featureContainer, currentTitle);
  
  featureNeedsScroll = needsScroll;
  
  // Only reset animation if scrolling is needed
  if (needsScroll) {
    resetAnimation(featureContainer);
  }
  
  // Wait for DOM to update with new content before showing
  setTimeout(() => {
    const displayedText = featureContent?.textContent || '';
    if (displayedText === currentTitle) {
      featureContentReady = true;
    }
  }, 0);
});

$effect(() => {
  // Re-check when content changes and reset animation
  collectionTitle;
  
  // Use the current reactive title to determine scroll need, not DOM content
  const currentTitle = isNewFeatureMode 
    ? m.smart_crazy_cuckoo_play()
    : collectionTitle + (isNotFeatureMode ? ` (${index} of ${collectionSize})` : '');
  
  const needsScroll = checkScrollNeedForText(collectionContainer, currentTitle);
  collectionNeedsScroll = needsScroll;
  
  // Only reset animation if scrolling is needed
  if (needsScroll) {
    resetAnimation(collectionContainer);
  }
  
  setTimeout(() => {
    // Verify the displayed content matches the current reactive state
    const displayedText = collectionContent?.textContent || '';
    
    if (displayedText.includes(currentTitle) || displayedText === currentTitle) {
      collectionContentReady = true;
    }
  }, 0);
});
</script>

<div
  class="flex w-full select-none justify-between gap-1 overflow-hidden py-0 transition-[height] {isNotFeatureMode &&
  !isNewFeatureMode
    ? 'px-0'
    : 'px-6'}">
  <div
    class="min-w-0 flex-1 overflow-hidden transition-[height]"
    onclick={() => omniCtx.toggleCard()}>
    <div class="flex items-start gap-3">
      {#if isNotFeatureMode && !isNewFeatureMode}
        <button
          class="btn btn-ghost btn-sm m-0 h-auto p-0 pt-2 hover:bg-transparent hover:text-base-content/80 focus:outline-none"
          onclick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            omniCtx.closeCard();
            omniCtx.toggleTray(e);
          }}>
          <Icon src={QueueList} class="h-6 w-6 stroke-2" />
        </button>
      {/if}
      <div
        class="flex min-w-0 flex-1 -translate-y-0.5 flex-col overflow-hidden transition-[height] duration-300">
        <!-- Collection Title -->
        <div
          class="scroll-container relative h-[22px] w-full pt-1.5 {collectionNeedsScroll
            ? 'overflow-hidden'
            : 'overflow-visible'}"
          bind:this={collectionContainer}>
          {#if collectionContentReady}
            <div
              class="scroll-wrapper {collectionNeedsScroll
                ? 'animate needs-scroll'
                : ''}">
              <span
                class="scroll-primary text-xs text-base-content/60"
                bind:this={collectionContent}>
                {#if isNewFeatureMode}
                  {m.smart_crazy_cuckoo_play()}
                {:else}
                  {collectionTitle}
                  {#if isNotFeatureMode}
                    <span>({index} of {collectionSize})</span>
                  {/if}
                {/if}
              </span>
              {#if collectionNeedsScroll}
                <span class="scroll-secondary text-xs text-base-content/60">
                  {#if isNewFeatureMode}
                    {m.smart_crazy_cuckoo_play()}
                  {:else}
                    {collectionTitle}
                    {#if isNotFeatureMode}
                      <span>({index} of {collectionSize})</span>
                    {/if}
                  {/if}
                </span>
              {/if}
            </div>
          {:else}
            <!-- Hidden content for measurement -->
            <div class="scroll-wrapper opacity-0">
              <span
                class="scroll-primary text-xs text-base-content/60"
                bind:this={collectionContent}>
                {#if isNewFeatureMode}
                  {m.smart_crazy_cuckoo_play()}
                {:else}
                  {collectionTitle}
                  {#if isNotFeatureMode}
                    <span>({index} of {collectionSize})</span>
                  {/if}
                {/if}
              </span>
            </div>
          {/if}
        </div>

        <!-- Feature Title -->
        <div
          class="scroll-container relative h-6 w-full {featureNeedsScroll
            ? 'overflow-hidden'
            : 'overflow-visible'}"
          bind:this={featureContainer}>
          {#if featureContentReady}
            <div
              class="scroll-wrapper {featureNeedsScroll ? 'animate needs-scroll' : ''}">
              <span class="scroll-primary font-medium" bind:this={featureContent}>
                {isNewFeatureMode ? newFeatureTitle : featureTitle}
              </span>
              {#if featureNeedsScroll}
                <span class="scroll-secondary font-medium">
                  {isNewFeatureMode ? newFeatureTitle : featureTitle}
                </span>
              {/if}
            </div>
          {:else}
            <!-- Hidden content for measurement -->
            <div class="scroll-wrapper opacity-100">
              <span class="scroll-primary font-medium" bind:this={featureContent}>
                {isNewFeatureMode ? newFeatureTitle : featureTitle}
              </span>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <button
    class="btn btn-ghost btn-sm m-0 h-auto flex-none p-0 hover:bg-transparent hover:text-base-content/80"
    onclick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      omniCtx.close();
    }}>
    <Icon
      src={XCircle}
      class="h-10 w-10 transition-transform duration-300 {omniCtx.state.isCardOpen
        ? 'rotate-90'
        : 'rotate-0'}" />
  </button>
</div>

<style>
/* ═══════════════════════
   INFINITE SCROLL STYLES
   ═══════════════════════ */

.scroll-container {
  position: relative;
  max-width: 100%;
}

.scroll-container.overflow-hidden {
  mask-image: linear-gradient(
    to right,
    black 0px,
    black calc(100% - 10px),
    transparent
  );
}

.scroll-wrapper {
  display: flex;
  white-space: nowrap;
  width: fit-content;
}

.scroll-wrapper.animate {
  animation: scroll-single-title 13s linear infinite;
  animation-delay: 3s; /* 3 second pause at start */
}

.scroll-wrapper.animate:hover {
  animation-play-state: paused;
}

.scroll-primary {
  display: inline-block;
  padding-right: 10px; /* Further reduced gap between titles */
}

.scroll-secondary {
  display: inline-block;
}

/* Add tilde indicator for overflow */
.scroll-container.overflow-hidden .scroll-primary::after {
  color: currentColor;
  content: ' ~';
  padding-left: 10px;
  display: inline-block;
}

/* Animation that scrolls one title width then pauses */
@keyframes scroll-single-title {
  0% {
    transform: translateX(0);
  }
  /* Scroll phase: 0% to 77% (10s out of 13s) - scroll to center second title (50% + half spacing) */
  77% {
    transform: translateX(calc(-50% - 15px));
  }
  /* Pause phase: 77% to 100% (3s pause) */
  100% {
    transform: translateX(calc(-50% - 15px));
  }
}

/* Smooth animation performance */
.scroll-wrapper {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  transform-style: preserve-3d;
  -webkit-transform-style: preserve-3d;
}
</style>
