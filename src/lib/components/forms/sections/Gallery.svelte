<script lang="ts">
import { fade, blur } from 'svelte/transition';
import { flip } from 'svelte/animate';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import {
  Photo,
  ChevronLeft,
  ChevronRight,
  ExclamationCircle,
  Trash
} from '@steeze-ui/heroicons';
import { CldImage } from 'svelte-cloudinary';
import Dropzone from 'svelte-file-dropzone';
import Header from '$lib/components/forms/extra/Header.svelte';
import Actions from '$lib/components/forms/actions/Gallery.svelte';
import Stats from '$lib/components/forms/stats/Gallery.svelte';

// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';

// TYPES
import type { SectionProps, Image, EntityRouter, GetImageAPI } from '$lib/types';

// CONFIG
const intentOrder = [
  'undefined',
  'canonical',
  'closeUp',
  'context',
  'general',
  'evidence'
];

// STATE : PROPS
let {
  activeImage = $bindable(null),
  images = $bindable([]),
  ...sectionProps
}: SectionProps & {
  activeImage: GetImageAPI | null;
  images: GetImageAPI[];
} = $props();
let { title } = sectionProps;

let isLoadingImages = $state(false);

// DOM
let inputElement = $state<HTMLInputElement>();
let isFileDialogActive = $state(false);

// CONTEXT
const routerState = getRouterState() as EntityRouter;

// CONTEXT :: RESOURCE
const resourceState = getHierarchicalResourceState();

// STATE : DERIVED
let rejectedImages: File[] = $state([]);
let scrollContainer: HTMLDivElement;

// Track scroll position for arrows
let showLeftArrow = $state(false);
let showRightArrow = $state(false);

// Add these types for tracking upload status
type UploadStatus = 'uploading' | 'error' | 'done';
type ImageUploadState = {
  file: File;
  status: UploadStatus;
  retries: number;
};

// Update state
let uploadQueue = $state<ImageUploadState[]>([]);

// Add loading state
let imageLoadedMap = $state<Record<string, boolean>>({});
let allImagesLoaded = $derived(
  images.length > 0 && images.every((img) => imageLoadedMap[img.id])
);

// Add near other state declarations
let imagesDeleting = $state(new Set<string>());

function handleImageLoad(imageId: string) {
  imageLoadedMap[imageId] = true;
  if (allImagesLoaded) {
    updateScrollArrows();
  }
}

function handleWheel(event: WheelEvent) {
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
      left: deltaY,
      behavior: 'smooth'
    });
  }
}

function updateScrollArrows() {
  if (!scrollContainer) return;

  const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;

  // Show left arrow if we're not at the start
  showLeftArrow = scrollLeft > 20;

  // Show right arrow if we're not at the end (with small buffer)
  showRightArrow =
    scrollWidth > clientWidth && scrollLeft + clientWidth < scrollWidth - 20;
}

function handleScroll() {
  updateScrollArrows();
}

function scrollTo(direction: 'left' | 'right') {
  if (!scrollContainer) return;

  const scrollAmount = 600; // Width of 3 images
  const currentScroll = scrollContainer.scrollLeft;
  const targetScroll =
    direction === 'left' ? currentScroll - scrollAmount : currentScroll + scrollAmount;

  scrollContainer.scrollTo({
    left: targetScroll,
    behavior: 'smooth'
  });
}

// Add this sorting function outside of the effect
function sortImages(images: GetImageAPI[]): GetImageAPI[] {
  return images.sort((a, b) => {
    // First sort by publication status
    if (a.isPublished !== b.isPublished) {
      return a.isPublished ? -1 : 1;
    }
    // Then sort by intent order
    const intentCompare = intentOrder.indexOf(a.intent) - intentOrder.indexOf(b.intent);
    if (intentCompare !== 0) {
      return intentCompare;
    }
    // Finally, sort by creation date (newest first)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

// Update the effect to use the sorting function
$effect(() => {
  isLoadingImages = true;
  imageLoadedMap = {}; // Reset the loaded state when fetching new images
  fetch(`/api/images?featureId=${routerState.entity}`)
    .then((res) => res.json())
    .then((data) => sortImages(data))
    .then((sortedImages) => {
      images = sortedImages;
    })
    .catch((error) => {
      console.error('Failed to load images:', error);
    })
    .finally(() => {
      isLoadingImages = false;
      // Only call updateScrollArrows here if there are no images
      if (images.length === 0) {
        updateScrollArrows();
      } else {
        selectActiveImage(images[0]);
      }
    });
});

function handleFilesSelect(event: {
  detail: { acceptedFiles: File[]; fileRejections: File[] };
}) {
  const newFiles = event.detail.acceptedFiles.map((file) => ({
    file,
    status: 'uploading' as UploadStatus,
    retries: 0
  }));

  uploadQueue = [...uploadQueue, ...newFiles];
  rejectedImages = [...rejectedImages, ...event.detail.fileRejections];

  // Start upload for each new file
  newFiles.forEach((fileState) => handleUpload(fileState));
  updateScrollArrows();
}

// Update handleUpload to use the sorting function
const handleUpload = async (fileState: ImageUploadState) => {
  const folder = `${resourceState.state.organisation?.code ?? 'misc'}/${resourceState.state.project?.code ?? 'misc'}/`;

  try {
    const signResponse = await fetch('/api/cloudinary', {
      method: 'POST',
      body: JSON.stringify({ paramsToSign: { folder } })
    });
    const signData = await signResponse.json();

    const url = `https://api.cloudinary.com/v1_1/${signData.cloudname}/auto/upload`;
    const formData = new FormData();

    formData.append('file', fileState.file);
    formData.append('api_key', signData.apikey);
    formData.append('timestamp', signData.timestamp);
    formData.append('signature', signData.signature);
    // formData.append('eager', 'c_pad,h_300,w_400|c_crop,h_200,w_260');
    formData.append('folder', folder);

    // Upload to Cloudinary
    const cloudinaryResponse = await fetch(url, {
      method: 'POST',
      body: formData
    });
    const cloudinaryData = await cloudinaryResponse.json();

    // Prepare the image data for our database
    const imageData = {
      featureId: routerState.entity,
      cdn: 'cloudinary' as const,
      env: import.meta.env.VITE_CLOUDINARY_ENV,
      cdnId: cloudinaryData.asset_id,
      publicId: cloudinaryData.public_id,
      version: cloudinaryData.version,
      originalFilename: cloudinaryData.original_filename,
      originalExtension: cloudinaryData.format,
      originalWidth: cloudinaryData.width,
      originalHeight: cloudinaryData.height,
      capturedAt: cloudinaryData.created_at,
      featureImage: {
        featureId: routerState.entity,
        intent: 'undefined',
        isPublished: true
      }
    };

    // Save to our database
    const dbResponse = await fetch('/api/images', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(imageData)
    });

    if (!dbResponse.ok) {
      throw new Error('Failed to save image to database');
    }

    // Get the saved image data
    const savedImage = await dbResponse.json();

    // Add the new image and resort the array
    images = sortImages([savedImage, ...images]);

    // Remove from upload queue
    uploadQueue = uploadQueue.filter((item) => item.file !== fileState.file);

    // Select the new image
    selectActiveImage(savedImage);
  } catch (error) {
    console.error('Failed to process image:', error);
    // Update status to error in upload queue
    uploadQueue = uploadQueue.map((item) =>
      item.file === fileState.file ? { ...item, status: 'error' as UploadStatus } : item
    );
  }
};

// Add retry function
function retryUpload(fileState: ImageUploadState) {
  uploadQueue = uploadQueue.map((item) =>
    item.file === fileState.file
      ? { ...item, status: 'uploading' as UploadStatus, retries: item.retries + 1 }
      : item
  );
  handleUpload(fileState);
}

// ACTIONS
let actionProps = $state({
  searchMode: false,
  removeMode: false
});

// Fn for opening the file dialog programmatically
const openFileDialog = () => {
  if (inputElement) {
    inputElement.value = null; // TODO check if null needs to be set
    isFileDialogActive = true;
    inputElement.click();
  }
};

const actions = {
  add: () => openFileDialog(),
  remove: (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    actionProps.removeMode = !actionProps.removeMode;
    imagesPendingConfirmation = new Set();
  }
};

// DELETION

// Add state for deletion
let imagesToDelete = $state<Set<string>>(new Set());
let imagesPendingConfirmation = $state(new Set<string>());

// Add deletion handlers
function handleDelete(e: Event, image: GetImageAPI) {
  e.preventDefault();
  e.stopPropagation();
  imagesPendingConfirmation = new Set(imagesPendingConfirmation).add(image.id);
}

function cancelDelete(e: Event, image: GetImageAPI) {
  e.preventDefault();
  e.stopPropagation();
  const newSet = new Set(imagesPendingConfirmation);
  newSet.delete(image.id);
  imagesPendingConfirmation = newSet;
}

// Update the confirmDelete function
async function confirmDelete(e: Event, image: GetImageAPI) {
  e.preventDefault();
  e.stopPropagation();

  // Add to deleting set and force a UI update
  imagesDeleting = new Set(imagesDeleting).add(image.id);

  try {
    const response = await fetch(`/api/images/${image.id}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete image');
    }

    // Only filter images after successful deletion
    images = images.filter((img) => img.id !== image.id);
    // Select the next image
    selectActiveImage(images[0]);
  } catch (error) {
    console.error('Failed to delete image:', error);
    // Show error toast or notification
  } finally {
    // Clean up both sets with new Set to ensure reactivity
    imagesPendingConfirmation = new Set(
      [...imagesPendingConfirmation].filter((id) => id !== image.id)
    );
    imagesDeleting = new Set([...imagesDeleting].filter((id) => id !== image.id));
  }
}

// Add hover handler
function selectActiveImage(image: GetImageAPI) {
  activeImage = image;
}
</script>

<!-- Intent label -->
{#snippet intentLabel(intent: string, idx: number)}
  <div
    class="absolute bottom-0 left-0 right-0 flex justify-center p-2"
    transition:fade={{ duration: 200, delay: 150 + idx * 50 }}>
    <span class="rounded-lg bg-base-100/80 px-3 py-[6px] text-sm backdrop-blur-sm">
      {intent}
    </span>
  </div>
{/snippet}

{#snippet cloudImage(image: GetImageAPI, idx: number)}
  <div
    class="h-full w-full"
    onmouseenter={() => selectActiveImage(image)}
    onclick={() => selectActiveImage(image)}>
    {#if !imageLoadedMap[image.id]}
      <div
        class="absolute inset-0 animate-pulse rounded-lg bg-base-200"
        transition:fade={{ duration: 200 }}>
        <div class="flex h-full w-full items-center justify-center">
          <span class="loading loading-spinner loading-md"></span>
        </div>
      </div>
    {/if}

    <CldImage
      width="200"
      height="200"
      src={image.publicId}
      crop="fill"
      class="h-full w-full rounded-lg object-cover text-neutral
      {!imageLoadedMap[image.id] ? 'hidden' : 'block'}
      {image.isPublished ? '' : 'opacity-50'}
      "
      on:load={() => handleImageLoad(image.id)} />

    {#if imageLoadedMap[image.id] && !actionProps.removeMode}
      {@render intentLabel(image.intent, idx)}
    {/if}

    <!-- Delete overlay -->
    {#if actionProps.removeMode && !imagesPendingConfirmation.has(image.id) && !imagesDeleting.has(image.id)}
      {@render deleteOverlay(image)}
    {/if}

    <!-- Delete confirmation -->
    {#if imagesPendingConfirmation.has(image.id) && !imagesDeleting.has(image.id)}
      {@render deleteConfirmation(image)}
    {/if}

    <!-- Deleting state -->
    {#if imagesDeleting.has(image.id)}
      {@render deletingOverlay()}
    {/if}
  </div>
{/snippet}

{#snippet deleteOverlay(image: GetImageAPI)}
  <div
    class="absolute inset-0 flex items-center justify-center rounded-lg bg-base-100/30"
    transition:fade={{ duration: 200 }}>
    <button class="btn btn-circle btn-error" onclick={(e) => handleDelete(e, image)}>
      <Icon src={Trash} class="h-6 w-6" />
    </button>
  </div>
{/snippet}

{#snippet deleteConfirmation(image: GetImageAPI)}
  <div
    class="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-base-100/80 backdrop-blur-sm"
    transition:fade={{ duration: 200 }}>
    <p class="mb-4 text-sm">Delete this image?</p>
    <div class="flex gap-2">
      <button class="btn btn-ghost btn-sm" onclick={(e) => cancelDelete(e, image)}>
        Cancel
      </button>
      <button class="btn btn-error btn-sm" onclick={(e) => confirmDelete(e, image)}>
        Delete
      </button>
    </div>
  </div>
{/snippet}

{#snippet deletingOverlay()}
  <div
    class="absolute inset-0 flex items-center justify-center rounded-lg bg-base-100/80 backdrop-blur-sm"
    transition:blur={{ duration: 2500, opacity: 0.3, amount: 10 }}>
  </div>
{/snippet}

{#snippet scrollArrow(direction: 'left' | 'right')}
  <button
    class="arrow absolute {direction === 'left'
      ? 'left-6'
      : 'right-6'} top-1/2 z-20 -translate-y-1/2 transform rounded-full bg-base-100/80 p-2 shadow-lg transition-all hover:bg-base-100 hover:shadow-xl"
    onclick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      scrollTo(direction);
    }}
    in:fade={{ duration: 200 }}
    out:fade={{ duration: 200 }}>
    <Icon src={direction === 'left' ? ChevronLeft : ChevronRight} class="h-5 w-5" />
  </button>
{/snippet}

<div
  class="z-10 rounded-2xl bg-gradient-to-r from-rose-500/70 to-fuchsia-800/70 p-0 @container">
  <Header
    {...sectionProps}
    bind:actionProps
    {Actions}
    {actions}
    {Stats}
    bind:activeImage />
  <main class="relative w-full">
    <!-- Left Arrow -->
    {#if showLeftArrow}
      {@render scrollArrow('left')}
    {/if}
    <!-- Main scroll container -->
    <div
      class="m-4 flex min-w-0 gap-4 overflow-x-auto scroll-smooth rounded-xl bg-base-100 p-4"
      bind:this={scrollContainer}
      onwheel={handleWheel}
      onscroll={handleScroll}>
      <!-- Dropzone always first -->
      <div class="h-[200px] w-[200px] flex-none">
        <Dropzone
          accept={['image/*']}
          on:drop={handleFilesSelect}
          on:select={handleFilesSelect}
          class="flex h-full w-full flex-col justify-center gap-2 rounded-lg border-2 border-dashed border-base-content/10 bg-base-100/50 text-center align-middle transition-colors hover:border-primary"
          disableDefaultStyles={true}
          bind:inputElement>
          <Icon src={Photo} class="mx-auto mt-4 h-8 w-8" />
          <span class="mx-auto pb-6 text-sm">Drop images</span>
        </Dropzone>
      </div>

      <!-- Upload queue with loading states and transitions -->
      {#each uploadQueue as fileState (fileState.file)}
        <div
          animate:flip={{ duration: 300 }}
          in:fade={{ duration: 200 }}
          out:fade={{ duration: 200 }}
          class="relative h-[200px] w-[200px] flex-none">
          <img
            src={URL.createObjectURL(fileState.file)}
            alt=""
            class="h-full w-full rounded-lg object-cover" />

          <!-- Loading overlay -->
          {#if fileState.status === 'uploading'}
            <div
              class="absolute inset-0 flex items-center justify-center rounded-lg bg-base-100/50 backdrop-blur-sm"
              transition:fade={{ duration: 200 }}>
              <span class="loading loading-spinner loading-md"></span>
            </div>
          {/if}

          <!-- Error overlay -->
          {#if fileState.status === 'error'}
            <div
              class="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-base-100/50 backdrop-blur-sm"
              transition:fade={{ duration: 200 }}>
              <Icon src={ExclamationCircle} class="h-8 w-8 text-error" />
              <button
                class="btn btn-error btn-sm mt-2"
                onclick={() => retryUpload(fileState)}>
                Retry
              </button>
            </div>
          {/if}
        </div>
      {/each}

      <!-- Loading placeholders -->
      {#if isLoadingImages}
        {#each Array(3) as _, i}
          <div
            class="relative h-[200px] w-[200px] flex-none animate-pulse rounded-lg bg-base-200"
            in:fade={{ duration: 200, delay: i * 100 }}>
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="loading loading-spinner loading-md"></span>
            </div>
          </div>
        {/each}
      {:else}
        <!-- All images in a single list -->
        {#each [...images].sort((a, b) => {
          // Sort by published state first
          if (a.isPublished !== b.isPublished) {
            return a.isPublished ? -1 : 1;
          }
          // Keep original order within each group
          return images.indexOf(a) - images.indexOf(b);
        }) as image, i (image.id)}
          <div
            animate:flip={{ duration: 300 }}
            in:fade={{ duration: 200, delay: i * 100 }}
            out:fade={{ duration: 200 }}
            class="relative h-[200px] w-[200px] flex-none">
            {@render cloudImage(image, i)}
          </div>
        {/each}
      {/if}
    </div>

    <!-- Right Arrow -->
    {#if showRightArrow}
      {@render scrollArrow('right')}
    {/if}
  </main>
</div>

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

/* Ensure arrows are clickable but don't interfere with content */
button.arrow {
  backdrop-filter: blur(4px);
}

/* Optional: Add hover effect for arrows */
button.arrow:hover {
  transform: translateY(-50%) scale(1.1);
}
</style>
