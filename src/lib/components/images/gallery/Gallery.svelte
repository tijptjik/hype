<script lang="ts">
import { fade } from 'svelte/transition';
import { flip } from 'svelte/animate';
// SERVICES
import { getImageContext } from '$lib/context/image.svelte';
// COMPONENTS :: GALLERY
import Thumbnail from '$lib/components/images/gallery/Thumbnail.svelte';
import UploadThumbnail from '$lib/components/images/gallery/ThumbnailWhileUploading.svelte';
import ScrollArrow from '$lib/components/images/gallery/ScrollArrow.svelte';
import Dropzone from '$lib/components/images/gallery/Dropzone.svelte';
// TYPES
import type { ImageUpload } from '$lib/types';

// SERVICES
const imageCtx = getImageContext();

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

// DOM
let scrollContainer: HTMLElement;

// Get images for rendering
let images = $derived(imageCtx.getImages());

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

// HANDLERS :: THUMBNAIL INTERACTION
const handleThumbnailHover = (imageId: string, event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
  // Use target() method for proper communication with main viewer
  imageCtx.target(imageId);
};

const handleThumbnailClick = (imageId: string, event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
  // Use target() method which sets lastChangeType to 'target' for proper PhotoFrame transitions
  imageCtx.target(imageId);
};

// EFFECT :: AUTO-SCROLL TO ACTIVE IMAGE
$effect(() => {
  if (imageCtx.activeImage) {
    const activeImageElement = document.getElementById(
      `thumbnail-${imageCtx.activeImage.id}`
    );
    if (activeImageElement && scrollContainer) {
      // Get container and element positions
      const containerRect = scrollContainer.getBoundingClientRect();
      const elementRect = activeImageElement.getBoundingClientRect();

      // Calculate if element is outside visible area
      const isLeft = elementRect.left < containerRect.left;
      const isRight = elementRect.right > containerRect.right;

      if (isLeft || isRight) {
        const newScrollLeft = isLeft
          ? scrollContainer.scrollLeft + (elementRect.left - containerRect.left)
          : scrollContainer.scrollLeft + (elementRect.right - containerRect.right);

        scrollContainer.scrollTo({
          left: newScrollLeft,
          behavior: 'smooth'
        });
      }
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
  {#each imageCtx.getUploadQueue() as fileObject (fileObject.file)}
    {#if !fileObject.imageToReplace && fileObject.status === 'uploading'}
      <!-- Show new uploads normally -->
      <div in:fade={{ duration: 200 }} class="relative h-[200px] w-[200px] flex-none">
        <UploadThumbnail {fileObject} />
      </div>
    {/if}
  {/each}

  <!-- Thumbnails with proper interaction handlers -->
  {#each imageCtx.getImages() as image, i (image.id)}
    <div
      id="thumbnail-{image.id}"
      animate:flip={{ duration: 300 }}
      in:fade={{ duration: 200, delay: i * 100 }}
      out:fade={{ duration: 200 }}
      class="relative h-[200px] w-[200px] flex-none cursor-pointer"
      onmouseenter={(e) => handleThumbnailHover(image.id, e)}
      onclick={(e) => handleThumbnailClick(image.id, e)}>
      {#if imageCtx.isImageBeingReplaced(image.id)}
        <!-- Show upload thumbnail for replacement -->
        <UploadThumbnail
          fileObject={imageCtx.getReplacementUpload(image.id) as ImageUpload} />
      {:else}
        <Thumbnail
          {image}
          idx={i}
          {actionProps}
          isHighlighted={imageCtx.isImageHighlighted(image.id)} />
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
