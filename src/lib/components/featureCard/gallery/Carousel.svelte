<script lang="ts">
import Photo from './Photo.svelte';
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronLeft, ChevronRight } from '@steeze-ui/heroicons';
import { onMount, tick } from 'svelte';
// SERVICES
import { getImageService } from '$lib/context/images.svelte';

type PhotoComponent = {
  id: string;
  index: number;
  position: number;
};

// UTILS

let getImageIndex = (index: number): number => {
  const length = images.length;
  return ((index % length) + length) % length;
};

let getPhotoComponents = (): PhotoComponent[] => {
  // For single image, just show it without any transitions or wrapping
  if (images.length === 1) {
    return [
      {
        id: 'single-photo',
        index: 0,
        position: 0
      }
    ];
  }

  // Original initialization for multiple images
  const components = [
    {
      id: `photo-${getImageIndex(currentIndex - 1)}${images.length == 2 ? '-clone' : ''}`,
      index: getImageIndex(currentIndex - 1),
      position: -1
    },
    {
      id: `photo-${getImageIndex(currentIndex)}`,
      index: getImageIndex(currentIndex),
      position: 0
    },
    {
      id: `photo-${getImageIndex(currentIndex + 1)}`,
      index: getImageIndex(currentIndex + 1),
      position: 1
    }
  ];

  console.log('[Carousel] getPhotoComponents', components);
  return components;
};

let setState = (state: {
  currentIndex?: number;
  targetIndex?: number;
  containerOffsetX?: number;
  isDragging?: boolean;
  isTransitioning?: boolean;
  startX?: number;
  currentDelta?: number;
}) => {
  isTransitioning = state.isTransitioning ?? isTransitioning;
  isDragging = state.isDragging ?? isDragging;
  // tick().then(() => {
  currentIndex = state.currentIndex ?? currentIndex;
  targetIndex = state.targetIndex ?? targetIndex;
  currentDelta = state.currentDelta ?? currentDelta;
  containerOffsetX = state.containerOffsetX ?? containerOffsetX;
  startX = state.startX ?? startX;
  // });
};

// SERVICES
const imageService = getImageService();
let images = $derived(imageService.getImages());

// ELEMENTS
let container: HTMLDivElement;
let imageContainer: HTMLDivElement | null = $state(null);

// STATE : LOCAL
let currentIndex = $state(0);
let targetIndex = $state(0);
let containerWidth = 0;
let isTransitioning = $state(false);
let containerOffsetX = $state(0);
let photoComponents: PhotoComponent[] = $derived.by(getPhotoComponents);

// TOUCH STATE
let isDragging = $state(false);
let startX = $state(0);
let currentDelta = $state(0);

// CONSTANTS
const DRAG_THRESHOLD = 100;
const TRANSITION_DURATION = 300;

function snapToPosition() {
  if (isTransitioning) return;

  console.log('[Carousel] snapToPosition', currentIndex, targetIndex);
  const movement = currentIndex < targetIndex ? -containerWidth : containerWidth;

  setState({
    isDragging: false,
    isTransitioning: true,
    containerOffsetX: movement
  });

  setTimeout(() => {
    setState({
      isTransitioning: false,
      containerOffsetX: 0,
      currentIndex: targetIndex
    });
  }, TRANSITION_DURATION + 50);
}

function handleTouchStart(event: TouchEvent) {
  if (isTransitioning) return;

  setState({
    isDragging: true,
    startX: event.touches[0].clientX,
    currentDelta: 0,
    containerOffsetX: 0
  });
}

let handleTouchMove = async (event: TouchEvent) => {
  if (!isDragging || isTransitioning) return;

  currentDelta = event.touches[0].clientX - startX;
  containerOffsetX = currentDelta;
  await checkAndHandleThresholdMet();

  console.log('[Carousel] handleTouchMove', event);

  // Update transform directly during drag
  // imageContainer.style.transform = `translateX(${currentDelta}px)`;
};

function handleTouchEnd(event: TouchEvent) {
  if (!isDragging || isTransitioning) return;

  setState({
    isDragging: false
  });

  if (Math.abs(currentDelta) < DRAG_THRESHOLD) {
    setState({
      isTransitioning: true,
      containerOffsetX: 0,
      currentDelta: 0
    });

    setTimeout(() => {
      setState({
        isTransitioning: false
      });
    }, TRANSITION_DURATION);
  }
}

async function checkAndHandleThresholdMet() {
  if (Math.abs(currentDelta) >= DRAG_THRESHOLD) {
    setState({
      isDragging: false,
      targetIndex: currentIndex + (currentDelta > 0 ? -1 : 1)
    });
    snapToPosition();
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
  setState({
    targetIndex: currentIndex + (isLeftHalf ? -1 : 1)
  });

  snapToPosition();
}

function cleanup() {
  isDragging = false;
  isTransitioning = false;
  currentDelta = 0;
  containerOffsetX = 0;
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
    <!-- Navigation buttons - only show if more than one image -->
    {#if images.length > 1}
      <div class="absolute z-20 hidden h-full w-full">
        <button
          class="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
          onclick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setState({
              targetIndex: currentIndex - 1
            });
            snapToPosition();
          }}
          aria-label="Previous image">
          <Icon src={ChevronLeft} class="h-4 w-4" />
        </button>

        <button
          class="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
          onclick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setState({
              targetIndex: currentIndex + 1
            });
            snapToPosition();
          }}
          aria-label="Next image">
          <Icon src={ChevronRight} class="h-4 w-4" />
        </button>
      </div>
    {/if}

    <!-- Image intent -->
    <div
      class="absolute bottom-2 left-2 z-10 rounded bg-black/50 px-2 py-1 font-mono text-xs text-white">
      {images[getImageIndex(currentIndex)].intent}
    </div>

    <!-- Image counter - only show if more than one image -->
    {#if images.length > 1}
      <div
        class="absolute bottom-2 right-2 z-10 rounded bg-black/50 px-2 py-1 text-xs text-white">
        {getImageIndex(currentIndex) + 1} / {images.length}
      </div>
    {/if}

    <div
      class="relative h-full w-full touch-pan-y select-none"
      ontouchstart={images.length > 1 ? handleTouchStart : undefined}
      ontouchmove={images.length > 1 ? handleTouchMove : undefined}
      ontouchend={images.length > 1 ? handleTouchEnd : undefined}
      onclick={images.length > 1 ? handleInteraction : undefined}
      class:dragging={isDragging}
      class:transitioning={isTransitioning}
      style="transform: translateX({containerOffsetX}px)"
      bind:this={imageContainer}>
      {#each photoComponents as photo (photo.id)}
        {#key photo.id}
          <div
            class="absolute h-full w-full overflow-hidden"
            style="transform: translateX({photo.position * 100}%);">
            <Photo image={images[photo.index]} />
          </div>
        {/key}
      {/each}
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
