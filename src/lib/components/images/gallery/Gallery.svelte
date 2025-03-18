<script lang="ts">
import { fade, blur } from 'svelte/transition';
import { flip } from 'svelte/animate';
// LIB
import { sortImages, imageSets } from '$lib/images/index.svelte';
// COMPONENTS :: GALLERY
import Thumbnail from '$lib/components/images/gallery/Thumbnail.svelte';
import UploadThumbnail from '$lib/components/images/gallery/ThumbnailWhileUploading.svelte';
import ThumbnailsBeforeLoad from '$lib/components/images/gallery/ThumbnailsBeforeLoad.svelte';
import ScrollArrow from '$lib/components/images/gallery/ScrollArrow.svelte';
import Dropzone from '$lib/components/images/gallery/Dropzone.svelte';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// TYPES
import type {
  ImageUploadRefs,
  ImageEditRefs,
  Organisation,
  Project,
  GetImageAPI
} from '$lib/types';

type Props = {
  initialImage?: GetImageAPI;
  inputElement?: HTMLInputElement;
  actionProps?: {
    removeMode: boolean;
  };
  hasDropzone?: boolean;
  editContext?: ImageEditRefs;
};

// STATE :: PROPS
let {
  initialImage,
  inputElement = $bindable(),
  actionProps,
  hasDropzone = true,
  editContext
}: Props = $props();

// STATE :: SCROLL ARROWS
let showLeftArrow = $state(false);
let showRightArrow = $state(false);

// STATE :: IMAGES
let isLoadingImages = $state(false);
let allImagesLoaded = $derived(
  imageSets.images.length > 0 &&
    imageSets.images.every((img) => imageSets.imagesLoaded[img.id])
);

// CONTEXT :: RESOURCE
const resourceState = getHierarchicalResourceState();

let featureId = $derived(
  editContext
    ? editContext.refId
    : resourceState.activeResource === 'feature'
      ? resourceState.activeEntityRef
      : null
);

let refs: ImageUploadRefs = $derived({
  resource: resourceState.activeResource,
  entity: resourceState.activeEntityRef,
  organisation: resourceState.state.organisation as Organisation,
  project: resourceState.state.project as Project
});

let editRefs: ImageEditRefs = $derived(
  editContext
    ? editContext
    : {
        refType: refs.resource,
        refId: refs.entity
      }
);

// STATE :: EFFECTS
$effect(() => {
  isLoadingImages = true;
  imageSets.imagesLoaded = {}; // Reset the loaded state when fetching new images
  fetch(`/api/images?featureId=${featureId}`)
    .then((res) => res.json())
    .then((images) => {
      imageSets.images = images;
      sortImages();
    })
    .catch((error) => {
      console.error('Failed to load images:', error);
    })
    .finally(() => {
      isLoadingImages = false;
      // Only call updateScrollArrows here if there are no images
      if (imageSets.images.length === 0) {
        updateScrollArrows();
      } else {
        // TODO : Scroll to initial image if it exists
        // Set the active image to the initial image if it exists, otherwise the first image
        imageSets.activeImage = initialImage ?? imageSets.images[0];
      }
    });
});

// DOM
let scrollContainer: HTMLDivElement;

// HANDLERS :: IMAGES
const handleImageLoad = (imageId: string) => {
  imageSets.imagesLoaded[imageId] = true;
  if (allImagesLoaded) {
    updateScrollArrows();
  }
};

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
// TODO Add functionality to scroll image into view
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
      <Dropzone {refs} {updateScrollArrows} bind:inputElement />
    </div>
  {/if}

  <!-- Upload queue with loading states and transitions -->
  {#each imageSets.uploadQueue as fileState (fileState.file)}
    <div in:fade={{ duration: 200 }} class="relative h-[200px] w-[200px] flex-none">
      <UploadThumbnail {fileState} {refs} />
    </div>
  {/each}

  <!-- Loading placeholders -->
  {#if isLoadingImages}
    <ThumbnailsBeforeLoad />
  {:else}
    {#each imageSets.images as image, i (image.id)}
      <div
        animate:flip={{ duration: 300 }}
        in:fade={{ duration: 200, delay: i * 100 }}
        out:fade={{ duration: 200 }}
        class="relative h-[200px] w-[200px] flex-none">
        <Thumbnail {image} idx={i} {actionProps} refs={editRefs} />
      </div>
    {/each}
  {/if}
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
