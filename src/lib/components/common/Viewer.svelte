<script lang="ts">
import { fade, crossfade, scale } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
// CONTEXT
import { getHierarchicalResourceState as getResourceState } from '$lib/context/resources.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Camera, Photo, InformationCircle } from '@steeze-ui/heroicons';
import Dropzone from 'svelte-file-dropzone';
import {
  getURLfromImage,
  handleFilesSelect,
  imageSets,
  getActiveImageState,
  setImageLoadState,
  setStandaloneUploadState,
  resetImageStates
} from '$lib/images/index.svelte';
import Image from '$lib/components/common/Image.svelte';
import Metadata from '$lib/components/common/ImageMetadata.svelte';
import DownloadImageButton from '$lib/components/images/DownloadImageButton.svelte';
import UserAttributionCard from '$lib/components/user/UserAttributionCard.svelte';
import IconAnchor from '$lib/components/common/IconAnchor.svelte';
// ENUMS
import { HierarchicalResource } from '$lib/types';
// TYPES
import type {
  GetImageAPI,
  ImageEditRefs,
  Organisation,
  Project,
  ImageUploadRefs as Refs
} from '$lib/types';

// STATE : CONTEXT :: ROUTER
const resourceState = getResourceState();

type Props = {
  image: GetImageAPI | null;
  editContext?: ImageEditRefs;
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
  editContext,
  LeftActions,
  MiddleActions,
  RightActions,
  enableDropzone = false,
  isCrossfade = true
}: Props = $props();

// STATE
let isLoading = $state(false);

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
  if (!enableDropzone || !editContext?.refType || !editContext?.refId) return;

  // Reset states at the start of new upload
  resetImageStates();
  setStandaloneUploadState('uploading');

  await handleFilesSelect(e, {
    isStandalone: true,
    refs: {
      resource: editContext.refType,
      entity: editContext.refId,
      organisation: resourceState.getAscendantOrSelf(
        resourceState.getEntity(),
        editContext.refType as HierarchicalResource,
        HierarchicalResource.organisation
      ) as Organisation,
      project: resourceState.getAscendantOrSelf(
        resourceState.getEntity(),
        editContext.refType as HierarchicalResource,
        HierarchicalResource.project
      ) as Project,
      imageToReplace: image as GetImageAPI
    },
    callback: (savedImage: GetImageAPI) => {
      setStandaloneUploadState('uploaded');
      // Reset states for new image
      resetImageStates(savedImage.id);
      image = savedImage;
      imageSets.activeImage = savedImage;
      resourceState.invalidateAndRefresh(editContext.refType as HierarchicalResource);
    },
    onError: () => {
      setStandaloneUploadState('error');
    }
  });
};

// Handle image load events
const handleImageLoad = (imageId: string) => {
  setImageLoadState(imageId, 'loaded');
};

const handleImageError = (imageId: string) => {
  setImageLoadState(imageId, 'error');
};

let activeImageState = $derived.by(getActiveImageState);

$effect(() => {
  if (image?.id) {
    setImageLoadState(image.id, 'loading');
  }
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
    </div>
  </div>
{/snippet}

{#snippet ViewerContent(image: GetImageAPI, isReplacing = false)}
  <!-- Background Image -->
  <div
    class="absolute inset-0 z-10 h-full w-full bg-neutral"
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
      <!-- {#if activeImageState.preview && (!image || !activeImageState.isLoaded)} -->
      {#if image}
        {@render ViewerContent(image, activeImageState.preview ? true : false)}
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
          <LeftActions />
        {:else}
          <IconAnchor position="left" icon={Camera}>
            <Metadata {image} />
          </IconAnchor>
        {/if}
      </div>
      <!-- Middle Actions -->
      <div class="z-30 flex flex-row items-center gap-4">
        {#if MiddleActions}
          <MiddleActions />
        {/if}
      </div>
      <!-- Right Actions -->
      <div class="z-30 m-10 flex flex-row items-end gap-4">
        {#if RightActions}
          <RightActions />
        {:else}
          <IconAnchor position="right" icon={InformationCircle} class="mr-4">
            <UserAttributionCard
              userId={image.contributorId}
              date={image.createdAt || null}
              type="imageContributor" />
          </IconAnchor>
          <DownloadImageButton {image} />
        {/if}
      </div>
    </div>
  {/if}
</div>
