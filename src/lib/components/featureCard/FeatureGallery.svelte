<script lang="ts">
// SVELTE
import { onMount } from 'svelte';
// ICONS
import { spring } from 'svelte/motion';
// ENUMS
import { FeatureCardMode } from '$lib/types';
// COMPONENTS
import AddPhoto from './gallery/AddPhoto.svelte';
import Carousel from './gallery/Carousel.svelte';
// CONTEXT
import { getFeatureCardContext } from '$lib/context/featureCard.svelte';
// TYPES
import type { GetImageAPI } from '$lib/types';

// CONTEXT
const featureCardContext = getFeatureCardContext();

// STATE : PROPS
let { featureId }: { featureId: string } = $props();

// STATE : LOCAL
let images = $state<GetImageAPI[]>([]);
let currentIndex = $state(0);
let isLoading = $state(true);
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
async function loadImages() {
  isLoading = true;
  try {
    const response = await fetch(`/api/images?featureId=${featureId}`);
    images = await response.json();
  } catch (error) {
    console.error('Error loading images:', error);
    images = [];
  }
  isLoading = false;
}

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
  const deltaTime = event.timeStamp - event.changedTouches[0].timeStamp;
  const velocity = (endX - currentX) / deltaTime;

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
$effect(() => {
  loadImages();
});

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

<div
  class="flex-shrink-1 flex-grow-1 pointer-events-auto relative flex min-h-52 w-full basis-[35%] items-center justify-center overflow-hidden bg-base-content/20 backdrop-blur-sm"
  bind:this={container}>
  {#if isLoading}
    <div class="flex items-center justify-center">
      <span class="loading loading-ring loading-lg"></span>
    </div>
  {:else if images.length > 0 && featureCardContext.state.mode === FeatureCardMode.Display}
    <Carousel />
  {:else}
    <AddPhoto />
  {/if}
</div>

<style>
/* Smooth transitions for non-dragging state */
div:not(.dragging) {
  transition: transform 0.3s ease-out;
}
</style>
