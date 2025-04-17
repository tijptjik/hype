<script lang="ts">
import { fade, crossfade, scale } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
// PROVIDERS
import { getImageService } from '$lib/context/images.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Camera, Photo, InformationCircle } from '@steeze-ui/heroicons';
import Dropzone from 'svelte-file-dropzone';
import Image from '$lib/components/common/Image.svelte';
import Metadata from '$lib/components/common/ImageMetadata.svelte';
import DownloadImageButton from '$lib/components/images/DownloadImageButton.svelte';
import UserAttributionCard from '$lib/components/user/UserAttributionCard.svelte';
import IconAnchor from '$lib/components/common/IconAnchor.svelte';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// STATE : CONTEXT :: ROUTER
const imageService = getImageService();
const resourceState = getHierarchicalResourceState();
// TYPES
import type { GetImageAPI } from '$lib/types';
import type { HierarchicalResource } from '$lib/types';

type Props = {
  LeftActions?: any;
  MiddleActions?: any;
  RightActions?: any;
  enableDropzone?: boolean;
  enableReplacement?: boolean;
  isCrossfade?: boolean;
};

// STATE : PROPS
let {
  LeftActions,
  MiddleActions,
  RightActions,
  enableDropzone = false,
  isCrossfade = true
}: Props = $props();

let image = $derived(imageService.activeImage);
let imagePreview = $derived(imageService.activePreview);
let viewerState = $derived(imageService.viewerState);

let isPreviewReplacement = $derived(viewerState == 'previewReplacement');
let isPreview = $derived(viewerState == 'previewUploading');
let isTransition = $derived(viewerState == 'transition');
let isLoaded = $derived(viewerState == 'loaded');
let isEmpty = $derived(viewerState == 'empty');
let isLoading = $derived(viewerState == 'loading');
let isReplacing = $derived(isPreviewReplacement || isTransition);

let lastLoadedImageId = $state<string | null>(null);

$effect(() => {
  console.log('[Viewer] State changed:', {
    viewerState,
    imageId: image?.id,
    imagePreview: imagePreview?.preview
  });
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
  console.log('[Viewer] Drop event:', {
    acceptedFiles: e.detail.acceptedFiles,
    replacingImage: imageService.activeImage?.id
  });

  if (!enableDropzone) return;
  imageService.handleFilesSelect(
    e.detail.acceptedFiles,
    e.detail.fileRejections,
    {
      onSuccess: (savedImage) => {
        console.log('[Viewer] Upload success:', {
          savedImageId: savedImage.id,
          currentState: viewerState,
          uploadQueue: imageService.getUploadQueue()
        });
        resourceState.invalidateAndRefresh(
          resourceState.activeResource as HierarchicalResource
        );
      },
      onError: () => {
        console.log('[Viewer] Upload error');
      }
    },
    imageService.activeImage
  );
};
</script>

{#snippet LoadingOverlay(message = 'Loading...')}
  <div
    class="absolute inset-0 z-40 flex items-center justify-center"
    in:fade={{ duration: 200, delay: 200 }}
    out:fade={{ duration: 200 }}>
    <div
      class="flex flex-col items-center gap-2 rounded-lg"
      in:scale={{ duration: 200, delay: 200, start: 0.95 }}>
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>
  </div>
{/snippet}

{#snippet ViewerContent(isReplacing = false)}
  <!-- Background Image -->
  {#if image !== null && image !== undefined}
    <div
      class="absolute inset-0 z-10 h-full w-full bg-neutral"
      class:opacity-40={isPreview || isPreviewReplacement || isTransition}
      class:opacity-60={isLoaded}
      style="transition: opacity 400ms ease-out"
      in:receive={{ key: `bg-${image?.id}` }}
      out:send={{ key: `bg-${image?.id}` }}>
      <Image
        src={imageService.getURLfromImage({ image })}
        alt="Background Image"
        class="h-full w-full rounded-b-2xl text-base-100 blur-sm"
        layout="cover"
        showLoading={false}
        showError={false} />
    </div>
    <!-- Main Image -->
    <div
      class="absolute z-20 h-full w-full overflow-hidden rounded-2xl p-4"
      class:opacity-80={isPreview}
      class:opacity-100={isLoaded}
      style="transition: all 400ms ease-out"
      in:receive={{ key: `main-${image?.id}` }}
      out:send={{ key: `main-${image?.id}` }}>
      <Image
        src={imageService.getURLfromImage({ image })}
        class="mx-auto h-full overflow-hidden rounded-xl text-base-100"
        alt="Feature Image"
        layout="contain"
        showLoading={false}
        showError={false}
        onLoad={() => {
          if (image?.id === lastLoadedImageId) {
            console.log('[Viewer] Skipping duplicate load event for:', image.id);
            return;
          }

          console.log('[Viewer] Image loaded:', {
            imageId: image?.id,
            currentState: viewerState,
            loadStatus: imageService.getLoadStatus(image?.id)
          });

          imageService.setLoadStatus(image?.id, 'loaded');
          imageService.setActiveStatus(image?.id);
        }} />
    </div>
  {/if}

  <!-- Loading Overlay -->
  {#if isPreview || isPreviewReplacement || isLoading}
    {@render LoadingOverlay('Uploading...')}
  {/if}
{/snippet}

{#snippet PreviewContent()}
  <!-- Background Image -->
  {#if imagePreview?.preview || image?.preview}
    <div
      class="absolute inset-0 z-10 h-full w-full rounded-b-2xl bg-neutral opacity-60"
      style="transition: all 400ms ease-in-out"
      in:fade={{ duration: 400 }}>
      <Image
        src={imagePreview?.preview || image?.preview}
        alt="Preview Background"
        class="h-full w-full rounded-b-2xl text-base-100 blur-sm"
        layout="cover"
        showLoading={false}
        showError={false} />
    </div>
    <div
      class="absolute z-30 h-full w-full overflow-hidden rounded-2xl p-4 opacity-80"
      style="transition: all 400ms ease-in-out"
      in:fade={{ duration: 400, delay: 100 }}>
      <Image
        class="mx-auto h-full overflow-hidden rounded-xl text-base-100"
        src={imagePreview?.preview || image?.preview}
        alt="Preview Image"
        layout="contain"
        showLoading={false}
        showError={false} />
    </div>
  {/if}

  <!-- Loading Overlay -->
  {#if isPreview || isPreviewReplacement || isLoading}
    {@render LoadingOverlay('Uploading...')}
  {/if}
{/snippet}

{#snippet EmptyContent()}
  <Icon src={Photo} class="mx-auto mt-4 h-8 w-8" />
  <span class="mx-auto pb-6 text-sm">Drop image</span>
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
      class="group flex h-full w-full flex-col justify-center gap-2 rounded-xl bg-base-100/50 text-center align-middle transition-colors"
      disableDefaultStyles={true}>
      <div
        class="border-offset-2 pointer-events-none absolute inset-0 z-50 m-4 rounded-xl border-4 border-dashed border-transparent transition-colors delay-500 group-hover:border-primary">
      </div>

      {#if isLoading || isLoaded}
        {@render ViewerContent(isReplacing)}
        {@render PreviewContent()}
      {:else if isPreview || isPreviewReplacement}
        {@render PreviewContent()}
      {:else if isTransition}
        <!-- Show both during transition -->
        {@render PreviewContent()}
        {@render ViewerContent(isReplacing)}
      {:else if isEmpty}
        {@render EmptyContent()}
      {/if}
    </Dropzone>
  {:else if viewerState === 'image'}
    {#if isCrossfade}
      {#key image?.id}
        {@render ViewerContent(isReplacing)}
      {/key}
    {:else}
      {@render ViewerContent(isReplacing)}
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
          <IconAnchor position="left" icon={Camera}>
            {#if image}
              <Metadata {image} />
            {/if}
          </IconAnchor>
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
        {:else if image}
          <IconAnchor position="right" icon={InformationCircle} class="mr-4">
            <UserAttributionCard
              userId={image.contributorId}
              date={image.createdAt || undefined}
              type="imageContributor" />
          </IconAnchor>
          <DownloadImageButton {image} />
        {/if}
      </div>
    </div>
  {/if}
</div>
