<script lang="ts">
import Photo from './Photo.svelte';
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronLeft, ChevronRight } from '@steeze-ui/heroicons';
import { spring } from 'svelte/motion';
import { onMount } from 'svelte';
import type { GetImageAPI } from '$lib/types';

// STATE : PROPS
let { images }: { images: GetImageAPI[] } = $props();

// STATE : LOCAL
let currentIndex = $state(0);
let containerWidth = 0;
let container: HTMLDivElement;

// TOUCH STATE
let isDragging = $state(false);
let startX = $state(0);
let currentX = $state(0);
let offset = spring(0, {
  stiffness: 0.2,
  damping: 0.8
});

// CONSTANTS
const SWIPE_THRESHOLD = 0.3; // 30% of container width

// FUNCTIONS
function getImageIndex(index: number): number {
  // Handle wrapping for infinite scroll
  const length = images.length;
  return ((index % length) + length) % length;
}

function updateOffset(x: number) {
  offset.set(x);
}

function snapToImage(velocity = 0) {
  const currentOffset = $offset;
  const percentMoved = Math.abs(currentOffset / containerWidth);

  let nextIndex = currentIndex;

  if (percentMoved > SWIPE_THRESHOLD || Math.abs(velocity) > 0.5) {
    if (currentOffset < 0) {
      nextIndex = getImageIndex(currentIndex + 1);
    } else {
      nextIndex = getImageIndex(currentIndex - 1);
    }
  }

  currentIndex = nextIndex;
  offset.set(0, { hard: false });
}

// TOUCH HANDLERS
function handleTouchStart(event: TouchEvent) {
  isDragging = true;
  startX = event.touches[0].clientX;
  currentX = startX;

  // Stop the spring animation while dragging
  offset.stiffness = 1;
}

function handleTouchMove(event: TouchEvent) {
  if (!isDragging) return;
  event.preventDefault();

  currentX = event.touches[0].clientX;
  const deltaX = currentX - startX;
  updateOffset(deltaX);
}

function handleTouchEnd(event: TouchEvent) {
  if (!isDragging) return;

  isDragging = false;

  const endX = event.changedTouches[0].clientX;
  // Fix for timeStamp property not existing on Touch
  const deltaTime = event.timeStamp - event.timeStamp;
  const velocity = deltaTime === 0 ? 0 : (endX - currentX) / deltaTime;

  currentX = 0;
  startX = 0;

  // Reset spring stiffness for snap animation
  offset.stiffness = 0.2;
  snapToImage(velocity);
}

function handleImageClick() {
  currentIndex = getImageIndex(currentIndex + 1);
  offset.set(0);
}

// Add cleanup for touch events
function cleanup() {
  isDragging = false;
  currentX = 0;
  startX = 0;
  offset.set(0);
}

// LIFECYCLE
onMount(() => {
  if (container) {
    containerWidth = container.offsetWidth;
  }

  // Add touchcancel handler
  container?.addEventListener('touchcancel', cleanup);
  return () => {
    container?.removeEventListener('touchcancel', cleanup);
  };
});
</script>

<div class="relative h-full w-full" bind:this={container}>
  {#if images[currentIndex].intent !== 'undefined'}
    <!-- Image intent -->
    <div
      class="absolute bottom-2 left-2 z-10 rounded bg-black/50 px-2 py-1 font-mono text-xs text-white">
      {images[currentIndex].intent}
    </div>
  {/if}

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
    onclick={handleImageClick}
    class:dragging={isDragging}
    style="transform: translateX({$offset}px)">
    <!-- Previous Image -->
    <Photo image={images[getImageIndex(currentIndex - 1)]} position="previous" />

    <!-- Current Image -->
    <Photo image={images[currentIndex]} position="current" />

    <!-- Next Image -->
    <Photo image={images[getImageIndex(currentIndex + 1)]} position="next" />

    <!-- Navigation buttons - hidden on mobile -->
    <div class="hidden md:block">
      <button
        class="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
        onclick={() => {
          currentIndex = getImageIndex(currentIndex - 1);
          offset.set(0);
        }}
        aria-label="Previous image">
        <Icon src={ChevronLeft} class="h-4 w-4" />
      </button>

      <button
        class="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
        onclick={() => {
          currentIndex = getImageIndex(currentIndex + 1);
          offset.set(0);
        }}
        aria-label="Next image">
        <Icon src={ChevronRight} class="h-4 w-4" />
      </button>
    </div>
  </div>
</div>

<style>
/* Smooth transitions for non-dragging state */
div:not(.dragging) {
  transition: transform 0.3s ease-out;
}
</style>
