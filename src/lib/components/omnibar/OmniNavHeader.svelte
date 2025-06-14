<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte';
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
          ? getI18n(
              collection,
              'name',
              appCtx.getUserPreferences(),
              m.place()
            )
          : '';
      })()
);
let featureTitle = $derived((() => {
  const feature = appCtx.getActiveFeature();
  return feature
    ? getI18n(feature, 'title', appCtx.getUserPreferences())
    : '';
})());
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

  // Stop any existing animation
  state.isScrolling = false;

  // Clean up any existing duplicates more thoroughly
  const existingDuplicates = state.container.querySelectorAll('span:not(:first-child)');
  existingDuplicates.forEach(dup => dup.remove());
  
  // Wait a frame to ensure cleanup is complete
  requestAnimationFrame(() => {
    if (!state.content || !state.container) return;
    
    // Reset styles
    state.content.style.transform = 'translateX(0)';
    state.content.style.transition = 'none';
    state.content.style.position = 'relative';

    // Measure content width without the tilde - we'll position the duplicate at the content end
    const rect = state.content.getBoundingClientRect();
    state.scrollWidth = rect.width;
    state.containerWidth = state.container.getBoundingClientRect().width;
    
    // Check if we need scroll (add small buffer for tilde)
    state.needsScroll = state.scrollWidth > (state.containerWidth - 25);

    if (state.needsScroll && !state.isScrolling) {
      // Add overflow class to show tilde
      state.container.classList.add('overflow-hidden');
      startScrollAnimation(state);
    } else {
      // Remove overflow class if no scroll needed
      state.container.classList.remove('overflow-hidden');
    }
  });
}

async function startScrollAnimation(state: ScrollState) {
  if (!state.needsScroll || !state.content || !state.container) return;

  state.isScrolling = true;

  while (state.needsScroll && state.content && state.container && state.isScrolling) {
    // Create duplicate positioned immediately after the original content
    const duplicate = state.content.cloneNode(true) as HTMLSpanElement;
    duplicate.style.position = 'absolute';
    duplicate.style.top = '0';
    duplicate.style.left = `${state.scrollWidth}px`; // Position at end of original content
    duplicate.style.transform = 'translateX(0)';
    duplicate.style.transition = 'none';
    state.container.appendChild(duplicate);

    // Initial pause (3 seconds)
    await new Promise((resolve) => setTimeout(resolve, 3000));

    if (!state.isScrolling || !state.content || !state.container || !state.needsScroll) {
      if (duplicate && duplicate.parentNode) {
        duplicate.remove();
      }
      break;
    }

    // Calculate animation duration - scroll exactly the content width
    const duration = (state.scrollWidth / 45) * 1000; // 45px per second

    // Animate both elements moving left by exactly the content width
    state.content.style.transition = `transform ${duration}ms linear`;
    duplicate.style.transition = `transform ${duration}ms linear`;
    
    state.content.style.transform = `translateX(-${state.scrollWidth}px)`;
    duplicate.style.transform = `translateX(-${state.scrollWidth}px)`;

    // Wait for animation to complete
    await new Promise((resolve) => setTimeout(resolve, duration));

    if (!state.isScrolling || !state.content || !state.container || !state.needsScroll) {
      if (duplicate && duplicate.parentNode) {
        duplicate.remove();
      }
      break;
    }

    // Reset positions for next cycle - original is now where duplicate was
    state.content.style.transition = 'none';
    state.content.style.transform = 'translateX(0)';
    
    // Remove duplicate safely
    if (duplicate && duplicate.parentNode) {
      duplicate.remove();
    }

    // Brief pause before next cycle
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  state.isScrolling = false;
}

// Watch for content changes
$effect(() => {
  featureTitle;
  // Stop any existing animation and reset
  featureScroll.isScrolling = false;
  featureScroll.needsScroll = false;
  
  if (featureScroll.container) {
    featureScroll.container.classList.remove('overflow-hidden');
  }
  
  if (featureTitle && featureScroll.content && featureScroll.container) {
    // Reset styles immediately
    featureScroll.content.style.transform = 'translateX(0)';
    featureScroll.content.style.transition = 'none';
    
    // Clean up duplicates
    const duplicates = featureScroll.container.querySelectorAll('span:not(:first-child)');
    duplicates.forEach(dup => dup.remove());
    
    // Setup scroll after DOM is updated and text is rendered
    // Use longer delay for initial load when content might be loading
    requestAnimationFrame(() => {
      setTimeout(() => setupScroll(featureScroll), 300);
    });
  }
});

$effect(() => {
  collectionTitle;
  // Stop any existing animation and reset
  collectionScroll.isScrolling = false;
  collectionScroll.needsScroll = false;
  
  if (collectionScroll.container) {
    collectionScroll.container.classList.remove('overflow-hidden');
  }
  
  if (collectionTitle && collectionScroll.content && collectionScroll.container) {
    // Reset styles immediately
    collectionScroll.content.style.transform = 'translateX(0)';
    collectionScroll.content.style.transition = 'none';
    
    // Clean up duplicates
    const duplicates = collectionScroll.container.querySelectorAll('span:not(:first-child)');
    duplicates.forEach(dup => dup.remove());
    
    // Setup scroll after DOM is updated and text is rendered
    // Use longer delay for initial load when content might be loading
    requestAnimationFrame(() => {
      setTimeout(() => setupScroll(collectionScroll), 300);
    });
  }
});

// Add resize observers
$effect(() => {
  const observer = new ResizeObserver(() => {
    // Debounce resize events
    setTimeout(() => {
      if (featureTitle) setupScroll(featureScroll);
      if (collectionTitle) setupScroll(collectionScroll);
    }, 100);
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
  
  // Clean up any remaining duplicates
  if (featureScroll.container) {
    const duplicates = featureScroll.container.querySelectorAll('span:not(:first-child)');
    duplicates.forEach(dup => dup.remove());
  }
  if (collectionScroll.container) {
    const duplicates = collectionScroll.container.querySelectorAll('span:not(:first-child)');
    duplicates.forEach(dup => dup.remove());
  }
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
        <div
          class="title relative h-[22px] w-full {collectionScroll.needsScroll
            ? 'overflow-hidden'
            : 'overflow-visible'} whitespace-nowrap"
          bind:this={collectionScroll.container}>
          <span
            class="inline-block pr-3 text-xs text-base-content/60"
            bind:this={collectionScroll.content}>
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
        <div
          class="title relative h-6 w-full {featureScroll.needsScroll
            ? 'overflow-hidden'
            : 'overflow-visible'} whitespace-nowrap"
          bind:this={featureScroll.container}>
          <span class="inline-block pr-2 font-medium" bind:this={featureScroll.content}>
            {isNewFeatureMode ? newFeatureTitle : featureTitle}
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
