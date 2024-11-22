<script lang="ts">
import { fade } from 'svelte/transition';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Photo, ChevronLeft, ChevronRight } from '@steeze-ui/heroicons';
import { CldImage } from 'svelte-cloudinary';
import Dropzone from 'svelte-file-dropzone';
import Header from '$lib/components/forms/extra/Header.svelte';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';

// TYPES
import type { SectionProps, Image, EntityRouter } from '$lib/types';

// CONFIG
const intentOrder = [
  'canonical',
  'closeUp',
  'context',
  'general',
  'evidence',
  'undefined'
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
let selectedImages: File[] = $state([]);
let rejectedImages: File[] = $state([]);

let scrollContainer: HTMLDivElement;

// Track scroll position for arrows
let showLeftArrow = $state(false);
let showRightArrow = $state(true);

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
  showRightArrow = scrollLeft + clientWidth < scrollWidth - 20;
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

$effect(async () => {
  const response = await fetch(`/api/images?featureId=${routerState.entity}`);
  if (response.ok) {
    const fetchedImages = await response.json();
    // Sort images by intent order and publication status
    images = fetchedImages.sort((a: Image, b: Image) => {
      // First sort by publication status
      if (a.isPublished !== b.isPublished) {
        return a.isPublished ? -1 : 1;
      }
      // Then sort by intent order
      return intentOrder.indexOf(a.intent) - intentOrder.indexOf(b.intent);
    });
  }
});

function handleFilesSelect(event: {
  detail: { acceptedFiles: File[]; fileRejections: File[] };
}) {
  selectedImages = [...selectedImages, ...event.detail.acceptedFiles];
  rejectedImages = [...rejectedImages, ...event.detail.fileRejections];
  // Handle file upload logic here
  handleUpload();
}

const handleUpload = async () => {
  const folder = `${resourceState.state.organisation?.code ?? 'misc'}/${resourceState.state.project?.code ?? 'misc'}/`;

  const signResponse = await fetch('/api/cloudinary', {
    method: 'POST',
    body: JSON.stringify({ paramsToSign: { folder } })
  });
  const signData = await signResponse.json();

  const url = `https://api.cloudinary.com/v1_1/${signData.cloudname}/auto/upload`;
  const form = document.querySelector('form');

  const formData = new FormData();

  // Append parameters to the form data. The parameters that are signed using
  // the signing function (signuploadform) need to match these.
  for (let i = 0; i < selectedImages.length; i++) {
    let file = selectedImages[i];
    formData.append('file', file);
    formData.append('api_key', signData.apikey);
    formData.append('timestamp', signData.timestamp);
    formData.append('signature', signData.signature);
    // formData.append('eager', 'c_pad,h_300,w_400|c_crop,h_200,w_260');
    // TODO: Add to Organisation/Project folder
    formData.append('folder', folder);

    fetch(url, {
      method: 'POST',
      body: formData
    })
      .then((response) => {
        return response.text();
      })
      .then((data) => {
        JSON.parse(data);
      });
  }
};

// Initial check after images load
$effect(() => {
  if (images.length > 0) {
    updateScrollArrows();
  }
});
</script>

<div
  class="z-10 rounded-2xl bg-gradient-to-r from-rose-500/70 to-fuchsia-800/70 p-0 @container">
  <Header {...sectionProps} />
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
      class="m-4 flex gap-4 overflow-x-auto scroll-smooth rounded-xl bg-base-100 p-4"
      bind:this={scrollContainer}
      onwheel={handleWheel}
      onscroll={handleScroll}>
      {#each images as image, i (image.id)}
        {@const isFirstUnpublished =
          i > 0 && images[i - 1].isPublished && !image.isPublished}

        {#if isFirstUnpublished}
          <div class="h-[200px] w-0.5 bg-primary"></div>
        {/if}

        <div class="relative" class:opacity-80={!image.isPublished}>
          <CldImage
            width="200"
            height="200"
            src={image.publicId}
            alt="{image.intent} image of {$form.name}"
            crop="fill"
            class="rounded-lg object-cover" />
          <div class="absolute bottom-0 left-0 right-0 flex justify-center p-2">
            <span class="rounded bg-base-100/80 px-2 py-1 text-sm">
              {image.intent}
            </span>
          </div>
        </div>
      {/each}

      <!-- Dropzone -->
      <div class="h-[200px] w-[200px] shrink-0">
        <Dropzone
          accept={['image/*']}
          on:drop={handleFilesSelect}
          class="flex h-full w-full flex-col justify-center gap-2 rounded-lg border-2 border-dashed border-base-content/10 bg-base-100/50 text-center align-middle transition-colors hover:border-primary"
          disableDefaultStyles={true}>
          <button class="btn btn-sm mx-auto w-32">Select files</button>
          <Icon src={Photo} class="mx-auto mt-4 h-8 w-8" />
          <span class="mx-auto pb-6 text-sm">Drop images</span>
        </Dropzone>
      </div>
      {#if selectedImages.length > 0}
        {#each [...selectedImages].reverse() as image}
          <img
            src={`${URL.createObjectURL(image)}`}
            alt=""
            class="h-[200px] w-[200px] rounded-lg object-cover" />
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
