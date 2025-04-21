<script lang="ts">
import Photo from './Photo.svelte';
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronLeft, ChevronRight } from '@steeze-ui/heroicons';
import { onMount } from 'svelte';
// SERVICES
import { getImageService } from '$lib/context/images.svelte';

// SERVICES
const imageService = getImageService();
let images = $derived(imageService.getImages());

// ELEMENTS
let container: HTMLDivElement;
let imageContainer: HTMLDivElement;

// STATE : LOCAL
let currentIndex = $state(0);
let containerWidth = 0;
let isTransitioning = $state(false);
let translateX = $state(0);
let photoComponents = $state<{ id: string; index: number; position: number }[]>([]);

// TOUCH STATE
let isDragging = $state(false);
let startX = $state(0);
let currentDelta = $state(0);
let dragStartTranslateX = $state(0); // Add this to track initial translateX when drag starts

// CONSTANTS
const DRAG_THRESHOLD = 150;
const TRANSITION_DURATION = 300;

function getImageIndex(index: number): number {
  const length = images.length;
  return ((index % length) + length) % length;
}

function updatePhotoComponents(direction: 'left' | 'right') {
  const newIndex = getImageIndex(currentIndex + (direction === 'left' ? 1 : -1));
  const existingComponents = new Set(photoComponents.map((p) => p.index));

  if (direction === 'left') {
    // Only add new photo if it doesn't exist
    const rightmostPosition = Math.max(...photoComponents.map((p) => p.position));
    const newPhotoIndex = getImageIndex(currentIndex + 2);

    if (!existingComponents.has(newPhotoIndex)) {
      photoComponents = [
        ...photoComponents,
        {
          id: `photo-${newPhotoIndex}-${Date.now()}`,
          index: newPhotoIndex,
          position: rightmostPosition + 1
        }
      ];
    }

    // Remove leftmost photo if we have more than 4
    if (photoComponents.length > 4) {
      photoComponents = photoComponents.slice(1);
    }
  } else {
    // Only add new photo if it doesn't exist
    const leftmostPosition = Math.min(...photoComponents.map((p) => p.position));
    const newPhotoIndex = getImageIndex(currentIndex - 2);

    if (!existingComponents.has(newPhotoIndex)) {
      photoComponents = [
        {
          id: `photo-${newPhotoIndex}-${Date.now()}`,
          index: newPhotoIndex,
          position: leftmostPosition - 1
        },
        ...photoComponents

      ];
    }

    // Remove rightmost photo if we have more than 4
    if (photoComponents.length > 4) {
      photoComponents = photoComponents.slice(0, -1);
    }
  }
}

function snapToPosition(nextIndex: number, direction: 'left' | 'right') {
  if (isTransitioning) return;

  isTransitioning = true;
  isDragging = false;

  // Update translateX based on direction
  const movement = direction === 'left' ? -containerWidth : containerWidth;
  translateX += movement;

  // Add new photo component in the direction we're moving
  updatePhotoComponents(direction);

  setTimeout(() => {
    // Update current index
    currentIndex = nextIndex;
    isTransitioning = false;
  }, TRANSITION_DURATION);
}

function handleTouchStart(event: TouchEvent) {
  if (isTransitioning) return;

  isDragging = true;
  startX = event.touches[0].clientX;
  currentDelta = 0;
  dragStartTranslateX = translateX; // Store the initial translateX value
}

function handleTouchMove(event: TouchEvent) {
  if (!isDragging || isTransitioning) return;

  const currentX = event.touches[0].clientX;
  currentDelta = currentX - startX;

  checkAndHandleThresholdMet();

  // Update transform directly during drag
  imageContainer.style.transform = `translateX(${dragStartTranslateX + currentDelta}px)`;
}

function handleTouchEnd(event: TouchEvent) {
  if (!isDragging || isTransitioning) return;

  isDragging = false;

  if (Math.abs(currentDelta) < 10) {
    handleInteraction(event);
  } else {
    // If we haven't dragged far enough, snap back
    isTransitioning = true;
    imageContainer.style.transform = `translateX(${translateX}px)`;

    setTimeout(() => {
      isTransitioning = false;
      currentDelta = 0;
    }, TRANSITION_DURATION);
  }
}

function checkAndHandleThresholdMet() {
  if (Math.abs(currentDelta) >= DRAG_THRESHOLD) {
    const direction = currentDelta > 0 ? 'right' : 'left';
    const nextIndex = getImageIndex(currentIndex + (direction === 'left' ? 1 : -1));
    snapToPosition(nextIndex, direction);
  }
}

function handleInteraction(event: MouseEvent | TouchEvent | PointerEvent) {
  if (isTransitioning || isDragging) return;

  const rect = container.getBoundingClientRect();
  const clientX =
    event.type === 'touchend'
      ? startX
      : 'touches' in event
        ? event.touches[0].clientX
        : event?.clientX;
  const relativeX = clientX - rect.left;
  const isLeftHalf = relativeX < rect.width / 2;

  snapToPosition(
    getImageIndex(currentIndex + (isLeftHalf ? -1 : 1)),
    isLeftHalf ? 'right' : 'left'
  );
}

function cleanup() {
  isDragging = false;
  isTransitioning = false;
  currentDelta = 0;
  translateX = 0;
}

function initializePhotoComponents() {
  // For single image, just show it without any transitions or wrapping
  if (images.length === 1) {
    photoComponents = [
      {
        id: 'photo-0-init',
        index: 0,
        position: 0
      }
    ];
    return;
  }

  // Original initialization for multiple images
  photoComponents = [
    {
      id: `photo-${getImageIndex(currentIndex - 1)}-init`,
      index: getImageIndex(currentIndex - 1),
      position: -1
    },
    {
      id: `photo-${currentIndex}-init`,
      index: currentIndex,
      position: 0
    },
    {
      id: `photo-${getImageIndex(currentIndex + 1)}-init`,
      index: getImageIndex(currentIndex + 1),
      position: 1
    }
  ];
}

onMount(() => {
  if (container) {
    containerWidth = container.offsetWidth;
    initializePhotoComponents();
  }

  container?.addEventListener('touchcancel', cleanup);
  return () => {
    container?.removeEventListener('touchcancel', cleanup);
  };
});
</script>

<div class="relative h-full w-full" bind:this={container}>
  {#if images.filter(Boolean).length > 0}
    <!-- Navigation buttons - only show if more than one image -->
    {#if images.length > 1}
      <div class="absolute z-20 hidden h-full w-full">
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
    {/if}

    <!-- Image intent -->
    <div
      class="absolute bottom-2 left-2 z-10 rounded bg-black/50 px-2 py-1 font-mono text-xs text-white">
      {images[currentIndex].intent}
    </div>

    <!-- Image counter - only show if more than one image -->
    {#if images.length > 1}
      <div
        class="absolute bottom-2 right-2 z-10 rounded bg-black/50 px-2 py-1 text-xs text-white">
        {currentIndex + 1} / {images.length}
      </div>
    {/if}

    <div
      class="relative h-full w-full touch-pan-y select-none"
      ontouchstart={images.length > 1 ? handleTouchStart : undefined}
      ontouchmove={images.length > 1 ? handleTouchMove : undefined}
      ontouchend={images.length > 1 ? (e) => handleTouchEnd(e) : undefined}
      onclick={images.length > 1 ? handleInteraction : undefined}
      class:dragging={isDragging}
      class:transitioning={isTransitioning}
      style="transform: translateX({translateX}px)"
      bind:this={imageContainer}>
      <div class="absolute inset-0">
        {#each photoComponents as photo (photo.id)}
          <div
            class="absolute h-full w-full"
            style="transform: translateX({photo.position * 100}%)">
            <Photo
              image={images[photo.index]}
              position={photo.position === 0
                ? 'current'
                : photo.position < 0
                  ? 'previous'
                  : 'next'} />
          </div>
        {/each}
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
</style>
