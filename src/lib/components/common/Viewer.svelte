<script lang="ts">
import { fade, crossfade, scale } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
// CONTEXT
import { getHierarchicalResourceState as getResourceState } from '$lib/context/resources.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import {
  Camera,
  Square2Stack,
  Document,
  AtSymbol,
  Calendar,
  CloudArrowDown,
  Photo,
  ExclamationCircle
} from '@steeze-ui/heroicons';
import { formatDate } from '$lib';
import Dropzone from 'svelte-file-dropzone';
import {
  downloadImage,
  getURLfromImage,
  handleFilesSelect,
  imageSets,
  getActiveImageState,
  setImageLoadState,
  setStandaloneUploadState,
  resetImageStates
} from '$lib/images/index.svelte';
import Image from '$lib/components/common/Image.svelte';
// TYPES
import type {
  GetImageAPI,
  ResourceType,
  Id,
  FacetRouter,
  Organisation,
  Project,
  ImageUploadRefs as Refs
} from '$lib/types';

// STATE : CONTEXT :: ROUTER
const resourceState = getResourceState();

type Props = {
  image: GetImageAPI | null;
  resource?: ResourceType;
  entityId?: Id;
  LeftActions?: any;
  MiddleActions?: any;
  RightActions?: any;
  enableDropzone?: boolean;
  enableReplacement?: boolean;
  isCrossfade?: boolean;
};

// STATE : PROPS
let {
  image,
  resource,
  entityId,
  LeftActions,
  MiddleActions,
  RightActions,
  enableDropzone = false,
  enableReplacement = true,
  isCrossfade = true
}: Props = $props();

// STATE
let isLoading = $state(false);

$effect(() => {
  console.log('Loading with IMAGE', image);
  imageSets;
  imageSets.activeImage = image;
});

// CROSSFADE
const [send, receive] = crossfade({
  duration: 400,
  fallback(node, params) {
    return {
      duration: 400,
      easing: cubicOut,
      css: (t) => `
        opacity: ${t};
        transform: scale(${0.95 + t * 0.05});
      `
    };
  }
});

// HANDLERS :: FILE DROP
const handleDrop = async (e: CustomEvent) => {
  console.log('📥 Drop event:', e.detail);
  if (!enableDropzone || !resource || !entityId) return;

  // Reset states at the start of new upload
  resetImageStates();
  setStandaloneUploadState('uploading');

  await handleFilesSelect(e, {
    isStandalone: true,
    refs: {
      resource,
      entity: entityId,
      organisation: resourceState.state.organisation as Organisation,
      project: resourceState.state.project as Project,
      imageToReplace: image as GetImageAPI
    },
    callback: (savedImage: GetImageAPI) => {
      console.log('✅ Upload complete:', savedImage);
      setStandaloneUploadState('uploaded');
      // Reset states for new image
      resetImageStates(savedImage.id);
      image = savedImage;
      imageSets.activeImage = savedImage;
    },
    onError: () => {
      console.error('❌ Upload failed');
      setStandaloneUploadState('error');
    }
  });
};

// Handle image load events
const handleImageLoad = (imageId: string) => {
  console.log('🖼️ Image loaded:', imageId);
  setImageLoadState(imageId, 'loaded');
};

const handleImageError = (imageId: string) => {
  console.error('❌ Image load error:', imageId);
  setImageLoadState(imageId, 'error');
};

let activeImageState = $derived.by(getActiveImageState);

$effect(() => {
  if (image?.id) {
    setImageLoadState(image.id, 'loading');
  }
});

$effect(() => {
  console.log('🔄 Effect: Image changed', {
    image,
    preview: activeImageState.preview,
    isLoading: activeImageState.isLoading,
    isLoaded: activeImageState.isLoaded
  });
});
</script>

{#snippet LoadingOverlay(message = 'Loading...')}
  <div
    class="absolute inset-0 z-40 flex items-center justify-center"
    in:fade={{ duration: 200, delay: 200 }}>
    <div
      class="flex flex-col items-center gap-2 rounded-lg"
      in:scale={{ duration: 200, delay: 200, start: 0.95 }}>
      <span class="loading loading-spinner loading-lg text-primary"></span>
      <!-- <span class="text-sm">{message}</span> -->
    </div>
  </div>
{/snippet}

{#snippet ViewerContent(image: GetImageAPI, isReplacing = false)}
  <!-- Background Image -->
  <div
    class="absolute inset-0 z-10 h-full w-full rounded-b-2xl bg-neutral"
    class:opacity-0={activeImageState.isLoading && isReplacing}
    class:opacity-30={activeImageState.isLoading && !isReplacing}
    class:opacity-60={activeImageState.isLoaded && !isReplacing}
    style="transition: opacity 400ms ease-out"
    in:receive={{ key: `bg-${image.id}` }}
    out:send={{ key: `bg-${image.id}` }}>
    <Image
      src={getURLfromImage({ image })}
      alt="Background Image"
      class="h-full w-full rounded-b-2xl text-base-100 blur-sm"
      layout="cover"
      showLoading={false}
      showError={false} />
  </div>
  <!-- Main Image -->
  <div
    class="absolute z-20 h-full w-full overflow-hidden rounded-2xl p-4"
    class:opacity-0={activeImageState.isLoading && isReplacing}
    class:opacity-80={activeImageState.isLoading && !isReplacing}
    class:opacity-100={activeImageState.isLoaded && !isReplacing}
    style="transition: all 400ms ease-out"
    in:receive={{ key: `main-${image.id}` }}
    out:send={{ key: `main-${image.id}` }}>
    <Image
      class="mx-auto h-full overflow-hidden rounded-xl text-base-100"
      src={getURLfromImage({ image })}
      alt="Feature Image"
      layout="contain"
      showLoading={false}
      showError={false}
      onLoad={() => handleImageLoad(image.id)}
      onError={() => handleImageError(image.id)} />
  </div>

  <!-- Loading Overlay -->
  {#if activeImageState.isLoading || activeImageState.isUploading}
    {@render LoadingOverlay(activeImageState.isLoading ? 'Loading...' : 'Uploading...')}
  {/if}
{/snippet}

{#snippet PreviewContent()}
  <!-- Background Image -->
  <div
    class="absolute inset-0 z-10 h-full w-full rounded-b-2xl bg-neutral opacity-60"
    style="transition: all 400ms ease-out"
    in:fade={{ duration: 400 }}>
    <Image
      src={activeImageState.preview!}
      alt="Preview Background"
      class="h-full w-full rounded-b-2xl text-base-100 blur-sm"
      layout="cover"
      showLoading={false}
      showError={false} />
  </div>
  <!-- Main Image -->
  <div
    class="absolute z-30 h-full w-full overflow-hidden rounded-2xl p-4 opacity-80"
    style="transition: all 400ms ease-out"
    in:fade={{ duration: 400, delay: 100 }}>
    <Image
      class="mx-auto h-full overflow-hidden rounded-xl text-base-100"
      src={activeImageState.preview!}
      alt="Preview Image"
      layout="contain"
      showLoading={false}
      showError={false} />
  </div>

  <!-- Loading Overlay -->
  {@render LoadingOverlay('Uploading...')}
{/snippet}

{#snippet EmptyContent()}
  <Icon src={Photo} class="mx-auto mt-4 h-8 w-8" />
  <span class="mx-auto pb-6 text-sm">Drop image</span>
{/snippet}

{#snippet MetadataRow(icon, label, value)}
  <div class="flex items-center gap-2 text-sm text-base-content/80">
    <Icon src={icon} class="h-4 w-4 flex-grow-0" />
    <p class="font-medium">{label}:</p>
    <span>{value}</span>
  </div>
{/snippet}

{#snippet ImageMetadata(image)}
  <div class="flex flex-col gap-2">
    {#if image.cameraModel}
      {@render MetadataRow(Camera, 'Camera', image.cameraModel)}
    {/if}
    {#if image.originalWidth && image.originalHeight}
      {@render MetadataRow(
        Square2Stack,
        'Dimensions',
        `${image.originalWidth} x ${image.originalHeight}`
      )}
    {/if}
    {#if image.capturedAt}
      {@render MetadataRow(Calendar, 'Captured', formatDate(image.capturedAt))}
    {/if}
    {#if image.originalFilename && image.originalExtension}
      {@render MetadataRow(
        Document,
        'Filename',
        `${image.originalFilename}.${image.originalExtension}`
      )}
    {/if}
    {#if image.credit}
      {@render MetadataRow(AtSymbol, 'Credit', image.credit)}
    {/if}
  </div>
{/snippet}

<div
  class="relative flex h-full w-full flex-col {enableDropzone ? 'group' : ''}"
  style="transition: outline-color 150ms ease-out">
  {#if enableDropzone}
    <Dropzone
      accept={['image/*']}
      on:drop={handleDrop}
      on:select={handleDrop}
      multiple={false}
      class="group flex h-full w-full flex-col justify-center gap-2 rounded-lg bg-base-100/50 text-center align-middle transition-colors"
      disableDefaultStyles={true}>
      <div
        class="pointer-events-none z-50 absolute inset-0 rounded-lg border-4 border-dashed border-transparent transition-colors delay-500 group-hover:border-primary border-offset-2 m-4 rounded-xl"
      ></div> 
      <!-- {#if activeImageState.preview && (!image || !activeImageState.isLoaded)} -->
      {#if image}
        {#if isCrossfade}
          {#key image.id}
            {@render ViewerContent(image, activeImageState.preview ? true : false)}
          {/key}
        {:else}
          {@render ViewerContent(image, activeImageState.preview ? true : false)}
        {/if}
      {/if}
      {#if activeImageState.preview && !activeImageState.isLoaded}
        {@render PreviewContent()}
      {/if}
      {#if !image && !activeImageState.preview}
        {@render EmptyContent()}
      {/if}
    </Dropzone>
  {:else if image}
    {#if isCrossfade}
      {#key image.id}
        {@render ViewerContent(image)}
      {/key}
    {:else}
      {@render ViewerContent(image)}
    {/if}
  {/if}
  {#if image}
    <!-- Actions -->
    <div class="absolute bottom-0 z-30 flex w-full flex-row items-end justify-between">
      <!-- Left Actions -->
      <div class="m-10 flex flex-row items-start gap-4">
        {#if LeftActions}
          {@render LeftActions()}
        {:else}
          <!-- Metadata -->
          <div class="group/metadata relative">
            <!-- Metadata Icon -->
            <div
              class="absolute bottom-0 left-0 flex items-center justify-center opacity-70 transition-opacity duration-200 group-hover/metadata:opacity-0">
              <button class="btn btn-circle">
                <Icon src={Camera} class="h-6 w-6" />
              </button>
            </div>
            <!-- Metadata Card -->
            <div
              class="opacity-0 transition-opacity duration-200 group-hover/metadata:opacity-100">
              <div
                class="flex min-w-[200px] items-center gap-3 rounded-lg bg-base-200/70 p-3 backdrop-blur-sm">
                {@render ImageMetadata(image)}
              </div>
            </div>
          </div>
        {/if}
      </div>
      <!-- Middle Actions -->
      <div class="z-30 flex flex-row items-center gap-4">
        {#if MiddleActions}
          {@render MiddleActions()}
        {/if}
      </div>
      <!-- Right Actions -->
      <div class="z-30 m-10 flex flex-row items-end gap-4">
        {#if RightActions}
          {@render RightActions()}
        {:else}
          <!-- Image Credit -->
          <!-- <ImageCredit userId={image.contributorId} date={image.createdAt} /> -->
          <!-- Download Button -->
          <button
            class="btn btn-circle opacity-70 hover:text-neutral-content hover:opacity-100 hover:shadow-sm"
            onclick={(e) => downloadImage(e, image as GetImageAPI)}>
            <Icon src={CloudArrowDown} class="h-6 w-6" />
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>
