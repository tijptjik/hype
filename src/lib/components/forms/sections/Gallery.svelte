<script lang="ts">
import { fade } from 'svelte/transition';
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
let sectionProps: SectionProps = $props();
let { title } = sectionProps;

// CONTEXT
const routerState = getRouterState() as EntityRouter;

// CONTEXT :: RESOURCE
const resourceState = getHierarchicalResourceState();

// STATE : CONTEXT :: FORM
let { form } = sectionProps.form;

// STATE : DERIVED
let images: Image[] = $state([]);
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
let isLoadingImages = $state(true);

let imageLoadedMap = $state<Record<string, boolean>>({});

function handleImageLoad(imageId: string) {
  imageLoadedMap[imageId] = true;
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

  const scrollAmount = 400; // Adjust this value to control scroll distance
  const targetScroll =
    direction === 'left'
      ? scrollContainer.scrollLeft - scrollAmount
      : scrollContainer.scrollLeft + scrollAmount;

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
  updateScrollArrows();
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
</script>

<!-- Intent label -->
{#snippet intentLabel(intent: string)}
  <div class="absolute bottom-0 left-0 right-0 flex justify-center p-2">
    <span class="rounded-lg bg-base-100/80 px-3 py-[6px] text-sm backdrop-blur-sm">
      {intent}
    </span>
  </div>
{/snippet}

{#snippet cloudImage(image: GetImageAPI)}
  <div class="h-full w-full">
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
      alt="{image.intent} image of {$form.name}"
      crop="fill"
      class="h-full w-full rounded-lg object-cover"
      on:load={() => handleImageLoad(image.id)} />

    {@render intentLabel(image.intent)}
  </div>
{/snippet}

<div
  class="z-10 rounded-2xl bg-gradient-to-r from-rose-500/70 to-fuchsia-800/70 p-0 @container">
  <Header {...sectionProps} bind:actionProps {Actions} {actions} {Stats} />
  <main class="relative w-full">
    <!-- Left Arrow -->
    {#if showLeftArrow}
      <button
        class="absolute left-6 top-1/2 z-20 -translate-y-1/2 transform rounded-full bg-base-100/80 p-2 shadow-lg transition-all hover:bg-base-100 hover:shadow-xl"
        onclick={() => scrollTo('left')}
        in:fade={{ duration: 200 }}
        out:fade={{ duration: 200 }}>
        <Icon src={ChevronLeft} class="h-5 w-5" />
      </button>
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
          class="flex h-full w-full flex-col justify-center gap-2 rounded-lg border-2 border-dashed border-base-content/10 bg-base-100/50 text-center align-middle transition-colors hover:border-primary"
          disableDefaultStyles={true}>
          <Icon src={Photo} class="mx-auto mt-4 h-8 w-8" />
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
        <!-- Published images -->
        {#each images.filter((image) => image.isPublished) as image, i (image.id)}
          <div
            animate:flip={{ duration: 300 }}
            in:fade={{ duration: 200, delay: i * 100 }}
            out:fade={{ duration: 200 }}
            class="relative h-[200px] w-[200px] flex-none">
            {@render cloudImage(image)}
          </div>
        {/each}
        {#if images.filter((image) => image.isPublished).length > 0 && images.filter((image) => !image.isPublished).length > 0}
          <div class="h-[200px] w-1 flex-none bg-neutral"></div>
        {/if}
        {#each images.filter((image) => !image.isPublished) as image, i (image.id)}
          <div
            animate:flip={{ duration: 300 }}
            in:fade={{
              duration: 200,
              delay: (images.filter((image) => image.isPublished).length + i) * 100
            }}
            out:fade={{ duration: 200 }}
            class="relative h-[200px] w-[200px] flex-none opacity-50">
            {@render cloudImage(image)}
          </div>
        {/each}
      {/if}
    </div>

    <!-- Right Arrow -->
    {#if showRightArrow}
      <button
        class="absolute right-6 top-1/2 z-20 -translate-y-1/2 transform rounded-full bg-base-100/80 p-2 shadow-lg transition-all hover:bg-base-100 hover:shadow-xl"
        onclick={() => scrollTo('right')}
        in:fade={{ duration: 200 }}
        out:fade={{ duration: 200 }}>
        <Icon src={ChevronRight} class="h-5 w-5" />
      </button>
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
button {
  backdrop-filter: blur(4px);
}

/* Optional: Add hover effect for arrows */
button:hover {
  transform: translateY(-50%) scale(1.1);
}
</style>