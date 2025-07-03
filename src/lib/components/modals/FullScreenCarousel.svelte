<script lang="ts">
// GESTURES
import { tap, swipe } from 'svelte-gestures';
// I18N
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
import { getImageCtx } from '$lib/context/image.svelte';
// COMPONENTS
import Viewer from '../common/Viewer.svelte';
import Counter from '$lib/components/featureCard/gallery/Counter.svelte';
import UserAttributionCard from '$lib/components/user/UserAttributionCard.svelte';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { Camera } from '@steeze-ui/heroicons';
// TYPES
import type { Feature, Image } from '$lib/types';
import type { SwipeCustomEvent, TapCustomEvent } from 'svelte-gestures';

type Props = {
  feature: Feature;
};

// STATE : PROPS
let { feature }: Props = $props();

let appCtx = getAppCtx();
let imageCtx = getImageCtx();

// DERIVED STATES
let images: Image[] = $derived(imageCtx.getImages());
let currentImage: Image | null = $derived(imageCtx.activeImage);

// Reset attribution visibility when image changes
$effect(() => {
  currentImage;
  isAttributionVisible = false;
});

// DOM REFERENCE
let container: HTMLDivElement;

// UI STATE
let isAttributionVisible = $state(false);

function handleKeydown(event: KeyboardEvent) {
  // Only handle events if the modal is actually open and feature exists
  if (event.key === 'Escape' || event.key === ' ') {
    event.preventDefault();
    event.stopPropagation();
    imageCtx.setMode('normal');
  } else if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    // Navigate to feature address facet
    imageCtx.setMode('normal');
    appCtx.navNext({ isCardOpen: true });
  } else if (event.key === 'Tab') {
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
      imageCtx.prev();
    } else if (!event.shiftKey) {
      imageCtx.next();
    }
  }
}

function closeModal(event?: Event) {
  imageCtx.setMode('normal');
}

function toggleAttribution(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  isAttributionVisible = !isAttributionVisible;
}

// NAVIGATION HANDLERS
function handlePrevious(e: MouseEvent | SwipeCustomEvent | TapCustomEvent) {
  imageCtx.prev();
}

function handleNext(e: MouseEvent | SwipeCustomEvent | TapCustomEvent) {
  imageCtx.next();
}

// TAP GESTURE HANDLER
function handleTap(e: TapCustomEvent) {
  e.preventDefault();
  e.stopPropagation();
  if (images.length <= 1) {
    // If only one image, center tap closes modal
    closeModal();
    return;
  }

  const rect = container.getBoundingClientRect();
  const { x: relativeX } = e.detail;
  const leftBoundary = rect.width * 0.25;
  const rightBoundary = rect.width * 0.75;

  if (relativeX < leftBoundary) {
    // Left quarter - previous image
    handlePrevious(e as any);
  } else if (relativeX > rightBoundary) {
    // Right quarter - next image
    handleNext(e as any);
  } else {
    // Center half - close modal
    closeModal();
  }
}

// SWIPE GESTURE HANDLER
function handleSwipe(e: SwipeCustomEvent) {
  e.preventDefault();
  e.stopPropagation();
  if (images.length <= 1) return;
  const { direction } = e.detail;
  if (direction === 'left') {
    handleNext(e);
  } else if (direction === 'right') {
    handlePrevious(e);
  }
}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if imageCtx.isFullscreen}
  <div
    class="fixed inset-0 z-40 flex items-center justify-center bg-black/75 caret-transparent"
    onclick={closeModal}
    role="dialog"
    aria-modal="true">
    <div
      class="relative flex h-full w-full max-w-7xl items-center justify-center p-4"
      onclick={closeModal}
      bind:this={container}>
      <div
        class="relative flex h-full max-h-full w-full max-w-full items-center justify-center">
        <!-- Interaction layer positioned as background -->
        {#if images.length > 0}
          <div
            class="absolute inset-0 z-30"
            use:swipe={() => ({
              timeframe: 300,
              minSwipeDistance: 60,
              touchAction: 'manipulation'
            })}
            onswipe={handleSwipe}
            use:tap={() => ({ timeframe: 300, touchAction: 'manipulation' })}
            ontap={handleTap}
            onclick={(e) => e.stopPropagation()}>
          </div>
        {/if}

        {#if feature}
          <div
            class="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden">
            <Viewer isDropzone={false} hideActions={false} tightActions={true}>
              {#snippet LeftActions()}
                <div class="group/anchor relative z-50" onclick={toggleAttribution}>
                  <!-- Icon Button -->
                  <button
                    class="absolute bottom-0 left-0 m-2 flex cursor-pointer items-center justify-center rounded-lg bg-black/50 p-2 transition-opacity duration-200 {!isAttributionVisible
                      ? 'opacity-70 group-hover/anchor:opacity-0'
                      : 'opacity-0'}"
                    aria-label="Toggle image attribution">
                    <Icon src={Camera} class="h-6 w-6 stroke-[2px]" />
                  </button>
                  <!-- Revealed Content -->
                  <div
                    class="m-2 transition-opacity duration-200 {isAttributionVisible
                      ? 'opacity-100'
                      : 'opacity-0 group-hover/anchor:opacity-100'}">
                    {#if currentImage}
                      <UserAttributionCard
                        userId={currentImage.contributorId || ''}
                        date={currentImage.createdAt || undefined}
                        type="imageContributor"
                        bgClass="bg-black/50" />
                    {/if}
                  </div>
                </div>
              {/snippet}
              {#snippet MiddleActions()}{/snippet}
              {#snippet RightActions()}
                {#if currentImage}
                  <Counter {images} {currentImage} />
                {/if}
              {/snippet}
            </Viewer>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
