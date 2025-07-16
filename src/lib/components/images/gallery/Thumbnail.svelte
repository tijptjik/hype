<script lang="ts">
import { onMount, onDestroy } from 'svelte';
// SERVICES
import { getURLfromImage } from '$lib/client/services/image';
// CONTEXT
import { getImageCtx } from '$lib/context/image.svelte';
// COMPONENTS
import Img from '$lib/components/common/Image.svelte';
import IntentLabel from '$lib/components/images/IntentLabel.svelte';
import Loading from '$lib/components/images/gallery/overlays/Loading.svelte';
import Deletion from '$lib/components/images/gallery/overlays/Delete.svelte';
import Confirmation from '$lib/components/images/gallery/overlays/Confirmation.svelte';
import Deleting from '$lib/components/images/gallery/overlays/Deleting.svelte';
// TYPES
import type { Image, Intent } from '$lib/types';

// SERVICES
const imageCtx = getImageCtx();

// HTML
let thumbnailRef = $state<HTMLDivElement>();

type Props = {
  image: Image;
  idx: number;
  actionProps?: { removeMode: boolean };
  isHighlighted?: boolean;
};

let { image, idx, actionProps, isHighlighted = false }: Props = $props();

// Track thumbnail load state (main image load state is handled by PhotoFrame/Viewer)
let thumbnailLoadState = $derived(imageCtx.getThumbnailLoadStatus(image.id));
// Make isPublished reactive to changes in the image context state
// First check the updated image from context, then fall back to image prop
let isPublished = $derived.by(() => {
  const contextImage = imageCtx.getImage(image.id);
  const result = contextImage?.isPublished ?? image.isPublished;
  return result;
});

// Initialize load states for this thumbnail
onMount(() => {
  // Set initial thumbnail load state if not already set
  if (thumbnailLoadState === undefined) {
    imageCtx.setThumbnailLoadStatus(image.id, 'loading');
  }
});

// Cleanup on component destruction
onDestroy(() => {
  // Clean up thumbnail load status when component is destroyed
  imageCtx.resetThumbnailLoadStatus(image.id);
});
</script>

<div class="relative h-full w-full" data-image-id={image.id} bind:this={thumbnailRef}>
  <Img
    class="mx-auto h-[200px] w-[200px] overflow-hidden rounded-lg border-base-100 text-neutral transition-opacity duration-300 
      {isPublished ? 'opacity-100' : 'border-2 border-base-200/60 blur-sm'}
      {thumbnailLoadState === 'loading' ? '!opacity-30' : ''}"
    src={getURLfromImage({
      image,
      transformation: 'c_fill,w_200,h_200,q_auto'
    })}
    alt="thumbnail"
    layout="cover"
    showLoading={true}
    onLoad={() => {
      imageCtx.setThumbnailLoadStatus(image.id, 'loaded');
    }}
    onError={() => {
      imageCtx.setThumbnailLoadStatus(image.id, 'error');
    }} />

  {#if isHighlighted}
    <div
      class="absolute bottom-0 right-0 z-50 h-0 w-0 border-b-[20px] border-l-[20px] border-b-primary border-l-transparent">
    </div>
  {/if}

  {#if thumbnailLoadState === 'loaded'}
    <IntentLabel
      container={thumbnailRef}
      intent={(image.intent || 'undefined') as Intent}
      {idx}
      imageId={image.id} />
  {/if}

  <!-- Error message overlay (highest priority) -->
  {#if imageCtx.hasErrorMessage(image.id)}
    <div
      class="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-lg bg-error text-error-content backdrop-blur-sm">
      <div class="p-2 text-center">
        <div class="mb-1 text-2xl text-white">⚠</div>
        <p class="text-lg font-semibold text-white/70">
          {@html imageCtx.getErrorMessage(image.id)?.message}
        </p>
      </div>
    </div>
  {:else if thumbnailLoadState === 'loading'}
    <Loading />
  {:else if actionProps}
    {#if actionProps.removeMode && thumbnailLoadState === 'loaded' && !imageCtx.pendingConfirmationHas(image.id) && !imageCtx.deletionQueueHas(image.id)}
      <Deletion {image} />
    {:else if imageCtx.pendingConfirmationHas(image.id) && !imageCtx.deletionQueueHas(image.id)}
      <Confirmation {image} />
    {:else if imageCtx.deletionQueueHas(image.id)}
      <Deleting />
    {/if}
  {/if}
</div>
