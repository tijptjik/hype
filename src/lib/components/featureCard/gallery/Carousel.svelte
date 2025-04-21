<script lang="ts">
import { fade } from 'svelte/transition';
import Photo from './Photo.svelte';
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronLeft, ChevronRight } from '@steeze-ui/heroicons';
import { onMount } from 'svelte';
// SERVICES
import { getImageService } from '$lib/context/images.svelte';

// SERVICES
const imageService = getImageService();
let images = $derived(imageService.getImages());

// STATE : LOCAL
let currentIndex = $state(0);
let containerWidth = 0;
let container: HTMLDivElement;
let isTransitioning = $state(false);
let translateX = $state(0);

// TOUCH STATE
let isDragging = $state(false);
let startX = $state(0);
let currentDelta = $state(0);

// CONSTANTS
const DRAG_THRESHOLD = 100;
const TRANSITION_DURATION = 300;

function getImageIndex(index: number): number {
  const length = images.length;
  return ((index % length) + length) % length;
}

function snapToPosition(nextIndex: number, direction: 'left' | 'right') {
  if (isTransitioning) return;

  isTransitioning = true;
  isDragging = false;

  // Set initial position without transition
  translateX = direction === 'left' ? -containerWidth : containerWidth;

  // Force reflow
  container.offsetHeight;

  // Reset states after transition completes
  setTimeout(() => {
    // Trigger the transition to center
    requestAnimationFrame(() => {
      // Update index immediately to ensure proper image rendering
      currentIndex = nextIndex;
      translateX = 0;
      isTransitioning = false;
      currentDelta = 0;
    });
  }, TRANSITION_DURATION + 50);
}

function handleInteraction(event: MouseEvent | TouchEvent) {
  if (isTransitioning || isDragging) return;

  const rect = container.getBoundingClientRect();
  const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
  const relativeX = clientX - rect.left;
  const isLeftHalf = relativeX < rect.width / 2;

  snapToPosition(
    getImageIndex(currentIndex + (isLeftHalf ? -1 : 1)),
    isLeftHalf ? 'right' : 'left'
  );
}

function handleTouchStart(event: TouchEvent) {
  if (isTransitioning) return;

  isDragging = true;
  startX = event.touches[0].clientX;
  currentDelta = 0;
}

function handleTouchMove(event: TouchEvent) {
  if (!isDragging || isTransitioning) return;
  event.preventDefault();

  const currentX = event.touches[0].clientX;
  currentDelta = currentX - startX;
  translateX = currentDelta;

  // Check threshold during movement
  if (Math.abs(currentDelta) >= DRAG_THRESHOLD) {
    const isMovingRight = currentDelta > 0;
    snapToPosition(
      getImageIndex(currentIndex + (isMovingRight ? -1 : 1)),
      isMovingRight ? 'right' : 'left'
    );
  }
}

function handleTouchEnd() {
  if (!isDragging || isTransitioning) return;

  isDragging = false;

  // If we haven't hit the threshold, snap back to center
  if (Math.abs(currentDelta) < DRAG_THRESHOLD) {
    translateX = 0;
  }
}

function cleanup() {
  isDragging = false;
  isTransitioning = false;
  currentDelta = 0;
  translateX = 0;
}

onMount(() => {
  if (container) {
    containerWidth = container.offsetWidth;
  }

  container?.addEventListener('touchcancel', cleanup);
  return () => {
    container?.removeEventListener('touchcancel', cleanup);
  };
});
</script>

<div class="relative h-full w-full" bind:this={container}>
  {#if images.filter(Boolean).length > 0}
    <!-- Image intent -->
    <div
      class="absolute bottom-2 left-2 z-10 rounded bg-black/50 px-2 py-1 font-mono text-xs text-white">
      {images[currentIndex].intent}
    </div>

    <!-- Image counter -->
    <div
      class="absolute bottom-2 right-2 z-10 rounded bg-black/50 px-2 py-1 text-xs text-white">
      {currentIndex + 1} / {images.length}
    </div>

    <div
      class="relative h-full w-full touch-pan-y select-none"
      ontouchstart={handleTouchStart}
      ontouchmove={handleTouchMove}
      ontouchend={handleTouchEnd}
      onclick={handleInteraction}
      class:dragging={isDragging}
      class:transitioning={isTransitioning}
      style="transform: translateX({translateX}px)">
      <div class="absolute inset-0 flex">
        <!-- Previous Image -->
        <div class="absolute left-[-100%] h-full w-full">
          <Photo image={images[getImageIndex(currentIndex - 1)]} position="previous" />
        </div>

        <!-- Current Image -->
        <div class="absolute h-full w-full">
          <Photo image={images[currentIndex]} position="current" />
        </div>

        <!-- Next Image -->
        <div class="absolute left-[100%] h-full w-full">
          <Photo image={images[getImageIndex(currentIndex + 1)]} position="next" />
        </div>
      </div>

      <!-- Navigation buttons -->
      <div class="hidden w-120:block">
        <button
          class="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
          onclick={(e) => {
            e.stopPropagation();
            snapToPosition(getImageIndex(currentIndex - 1), 'right');
          }}
          aria-label="Previous image">
          <Icon src={ChevronLeft} class="h-4 w-4" />
        </button>

        <button
          class="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
          onclick={(e) => {
            e.stopPropagation();
            snapToPosition(getImageIndex(currentIndex + 1), 'left');
          }}
          aria-label="Next image">
          <Icon src={ChevronRight} class="h-4 w-4" />
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
.transitioning {
  transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1);
}

.dragging {
  transition: none;
}

/* Ensure images maintain their positions */
:global(.previous-image) {
  transform: translateX(-100%);
}

:global(.next-image) {
  transform: translateX(100%);
}
</style>
