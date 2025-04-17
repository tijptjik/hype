<script lang="ts">
import { fade } from 'svelte/transition';
import { flip } from 'svelte/animate';
// SERVICES
import { getImageService } from '$lib/context/images.svelte';
// COMPONENTS :: GALLERY
import Thumbnail from '$lib/components/images/gallery/Thumbnail.svelte';
import UploadThumbnail from '$lib/components/images/gallery/ThumbnailWhileUploading.svelte';
import ThumbnailsBeforeLoad from '$lib/components/images/gallery/ThumbnailsBeforeLoad.svelte';
import ScrollArrow from '$lib/components/images/gallery/ScrollArrow.svelte';
import Dropzone from '$lib/components/images/gallery/Dropzone.svelte';
import type { ImageUploadState } from '$lib/types';
// SERVICES
const imageService = getImageService();

type Props = {
  inputElement?: HTMLInputElement;
  actionProps?: {
    removeMode: boolean;
  };
  hasDropzone?: boolean;
};

// STATE :: PROPS
let { inputElement = $bindable(), actionProps, hasDropzone = true }: Props = $props();

// STATE :: SCROLL ARROWS
let showLeftArrow = $state(false);
let showRightArrow = $state(false);

// STATE :: IMAGES
let isLoadingImagesAmount = $derived(imageService.isImagesLoading);

// DOM
let scrollContainer: HTMLDivElement;

// HANDLERS :: SCROLL
const handleWheel = (event: WheelEvent) => {
  // Prevent default only when necessary
  if (!scrollContainer) return;

  const { deltaY } = event;
  const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;

  // Calculate if we're at the edges
  const isAtLeftEdge = scrollLeft <= 0;
  const isAtRightEdge = scrollLeft + clientWidth >= scrollWidth;

  // Only prevent default if:
  // 1. Scrolling right and not at right edge
  // 2. Scrolling left and not at left edge
  if ((deltaY > 0 && !isAtRightEdge) || (deltaY < 0 && !isAtLeftEdge)) {
    event.preventDefault();

    // Smooth scroll horizontally
    scrollContainer.scrollBy({
      left: deltaY * 2,
      behavior: 'smooth'
    });
  }
};

const handleScroll = () => {
  updateScrollArrows();
};

// UTILS :: SCROLL
const updateScrollArrows = () => {
  if (!scrollContainer) return;

  const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;

  // Show left arrow if we're not at the start
  showLeftArrow = scrollLeft > 20;

  // Show right arrow if we're not at the end (with small buffer)
  showRightArrow =
    scrollWidth > clientWidth && scrollLeft + clientWidth < scrollWidth - 20;
};

const scrollTo = (direction: 'left' | 'right') => {
  if (!scrollContainer) return;

  const scrollAmount = 600; // Width of 3 images
  const currentScroll = scrollContainer.scrollLeft;
  const targetScroll =
    direction === 'left' ? currentScroll - scrollAmount : currentScroll + scrollAmount;

  scrollContainer.scrollTo({
    left: targetScroll,
    behavior: 'smooth'
  });
};

$effect(() => {
  console.log('[Gallery] Active image:', imageService.activeImage);
  // TODO Add functionality to scroll image into view
  if (imageService.activeImage) {
    const activeImageElement = document.getElementById(imageService.activeImage.id);
    if (activeImageElement) {
      activeImageElement.scrollIntoView({ behavior: 'smooth' });
    }
  }
});
</script>

<!-- Left Arrow -->
{#if showLeftArrow}
  <ScrollArrow direction="left" onScroll={scrollTo} />
{/if}
<!-- Main scroll container -->
<div
  class="flex w-full min-w-0 gap-4 overflow-x-auto scroll-smooth rounded-xl bg-base-100 p-4"
  bind:this={scrollContainer}
  onwheel={handleWheel}
  onscroll={handleScroll}>
  <!-- Dropzone always first -->
  {#if hasDropzone}
    <div class="h-[200px] w-[200px] flex-none">
      <Dropzone {updateScrollArrows} bind:inputElement />
    </div>
  {/if}

  <!-- Upload queue with loading states and transitions -->
  {#each imageService.getUploadQueue() as fileObject (fileObject.file)}
    {#if !fileObject.imageToReplace && fileObject.status === 'invalidated'}
      <!-- Show new uploads normally -->
      <div in:fade={{ duration: 200 }} class="relative h-[200px] w-[200px] flex-none">
        <UploadThumbnail {fileObject} />
      </div>
    {/if}
  {/each}

  <!-- Loading placeholders -->
  {#if isLoadingImagesAmount > 0}
    <ThumbnailsBeforeLoad number={isLoadingImagesAmount as number} />
  {/if}

  <!-- Images -->
  {#each imageService.getImages() as image, i (image.id)}
    <div
      animate:flip={{ duration: 300 }}
      in:fade={{ duration: 200, delay: i * 100 }}
      out:fade={{ duration: 200 }}
      class="relative h-[200px] w-[200px] flex-none">
      {#if imageService.isImageBeingReplaced(image.id)}
        <!-- Show upload thumbnail for replacement -->
        <UploadThumbnail
          fileObject={imageService.getReplacementUpload(
            image.id
          ) as ImageUploadState} />
      {:else}
        <Thumbnail {image} idx={i} {actionProps} />
      {/if}
    </div>
  {/each}
</div>

<!-- Right Arrow -->
{#if showRightArrow}
  <ScrollArrow direction="right" onScroll={scrollTo} />
{/if}

<style>
/* Hide scrollbar but keep functionality */
.overflow-x-auto {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}

.overflow-x-auto::-webkit-scrollbar {
  display: none; /* Chrome, Safari and Opera */
}

/* Ensure smooth scrolling */
.scroll-smooth {
  scroll-behavior: smooth;
}
</style>
