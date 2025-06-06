<script lang="ts">
import { fade, scale } from 'svelte/transition';
// PROVIDERS
import { getImageContext } from '$lib/context/image.svelte';
// SERVICES
import { getURLfromImage } from '$lib/client/services/image';
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
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// STATE : CONTEXT :: ROUTER
const imageCtx = getImageContext();
const resourceState = getHierarchicalResourceState();
// TYPES
import type { HierarchicalResource } from '$lib/enums';

type Props = {
  LeftActions?: any;
  MiddleActions?: any;
  RightActions?: any;
  isDropzone?: boolean;
  enableReplacement?: boolean;
  isCrossfade?: boolean;
};

// STATE : PROPS
let {
  LeftActions,
  MiddleActions,
  RightActions,
  isDropzone = false,
  isCrossfade = true
}: Props = $props();

let image = $derived(imageCtx.activeImage);
let imagePreview = $derived(imageCtx.activePreview);
let viewerState = $derived(imageCtx.viewerState);

let isPreviewReplacement = $derived(viewerState == 'previewReplacement');
let isPreview = $derived(viewerState == 'previewUploading');
let isTransition = $derived(viewerState == 'transition');
let isLoaded = $derived(viewerState == 'loaded');
let isEmpty = $derived(viewerState == 'empty');
let isLoading = $derived(viewerState == 'loading');
let isReplacing = $derived(isPreviewReplacement || isTransition);

let lastLoadedImageId = $state<string | null>(null);
// HANDLERS :: FILE DROP
const handleDrop = async (e: CustomEvent) => {
  if (!isDropzone) return;
  imageCtx.handleFilesSelect(
    e.detail.acceptedFiles,
    e.detail.fileRejections,
    {
      onSuccess: (savedImage) => {
        resourceState.invalidateAndRefresh(
          resourceState.activeResource as HierarchicalResource
        );
      },
      onError: () => {
        console.error('[Viewer] Upload error');
      }
    },
    imageCtx.activeImage
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
      class="absolute inset-0 z-10 h-full w-full"
      class:opacity-40={isPreview || isPreviewReplacement || isTransition}
      class:opacity-60={isLoaded || isLoading}
      in:fade={{ duration: 400 }}
      out:fade={{ duration: 400 }}>
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
      class:opacity-80={isPreview || isPreviewReplacement || isTransition}
      class:opacity-100={isLoaded || isLoading}
      in:fade={{ duration: 400 }}
      out:fade={{ duration: 400 }}>
      <Image
        src={getURLfromImage({ image })}
        class="mx-auto h-full overflow-hidden rounded-xl text-base-100"
        alt="Feature Image"
        layout="contain"
        showLoading={false}
        showError={false}
        onLoad={() => {
          if (image?.id === lastLoadedImageId) {
            return;
          }

          imageCtx.setLoadStatus(image?.id, 'loaded');
          imageCtx.setActiveImage(image);
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
      class="absolute inset-0 z-10 h-full w-full rounded-b-2xl opacity-60"
      in:fade={{ duration: 400 }}
      out:fade={{ duration: 400 }}>
      <Image
        src={imagePreview?.preview || image?.preview || ''}
        alt="Preview Background"
        class="h-full w-full rounded-b-2xl text-base-100 blur-sm"
        layout="cover"
        showLoading={false}
        showError={false} />
    </div>
    <div
      class="absolute z-30 h-full w-full overflow-hidden rounded-2xl p-4 opacity-80"
      in:fade={{ duration: 400 }}
      out:fade={{ duration: 400, delay: 100 }}>
      <Image
        class="mx-auto h-full overflow-hidden rounded-xl text-base-100"
        src={imagePreview?.preview || image?.preview || ''}
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
  class="relative flex h-full w-full flex-col {isDropzone ? 'group' : ''}"
  style="transition: outline-color 150ms ease-out">
  {#if isDropzone}
    <Dropzone
      accept={['image/*']}
      on:drop={handleDrop}
      on:select={handleDrop}
      multiple={false}
      class="group flex h-full w-full flex-col justify-center gap-2 rounded-xl bg-neutral text-center align-middle transition-colors"
      disableDefaultStyles={true}>
      <div
        class="border-offset-2 pointer-events-none absolute inset-0 z-50 m-4 rounded-xl border-4 border-dashed border-transparent transition-colors delay-500 group-hover:border-primary">
      </div>
      {#if isLoaded || isLoading || isTransition}
        {@render ViewerContent(isReplacing)}
      {/if}
      {#if isLoading || isTransition || isPreview || isPreviewReplacement}
        {@render PreviewContent()}
      {/if}
      {#if isEmpty}
        {@render EmptyContent()}
      {/if}
    </Dropzone>
  {:else}
    {#if isLoaded || isLoading || isTransition}
      {@render ViewerContent(isReplacing)}
    {/if}
    {#if isLoading || isTransition || isPreview || isPreviewReplacement}
      {@render PreviewContent()}
    {/if}
    {#if isEmpty}
      {@render EmptyContent()}
    {/if}
  {/if}
  {#if image}
    <!-- Actions -->
    <!-- Left Actions -->
    <div
      class="absolute bottom-0 left-0 z-30 m-10 flex flex-row items-start gap-4 overflow-visible">
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
    <div
      class="absolute bottom-0 left-0 z-30 m-10 flex flex-row items-center gap-4 overflow-visible">
      {#if MiddleActions}
        {@render MiddleActions()}
      {/if}
    </div>
    <!-- Right Actions -->
    <div
      class="absolute bottom-0 right-0 z-30 m-10 flex flex-row items-end gap-4 overflow-visible">
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
  {/if}
</div>
