<script lang="ts">
import { onMount, onDestroy } from 'svelte';
// SERVICES
import { getURLfromImage } from '$lib/services/images.svelte';
// CONTEXT
import { getImageContext } from '$lib/context/images.svelte';
// COMPONENTS
import Image from '$lib/components/common/Image.svelte';
import IntentLabel from '$lib/components/images/IntentLabel.svelte';
import Loading from '$lib/components/images/gallery/overlays/Loading.svelte';
import Deletion from '$lib/components/images/gallery/overlays/Delete.svelte';
import Confirmation from '$lib/components/images/gallery/overlays/Confirmation.svelte';
import Deleting from '$lib/components/images/gallery/overlays/Deleting.svelte';
// TYPES
import type { GetImageAPI } from '$lib/types';

// SERVICES
const imageCtx = getImageContext();

type Props = {
  image: GetImageAPI;
  idx: number;
  actionProps?: { removeMode: boolean };
  isHighlighted?: boolean;
};

let { image, idx, actionProps, isHighlighted = false }: Props = $props();

// Track both main image and thumbnail load states
let imageLoadState = $derived(imageCtx.getLoadStatus(image.id));
let thumbnailLoadState = $derived(imageCtx.getThumbnailLoadStatus(image.id));

// Initialize load states for this thumbnail
onMount(() => {
  // Set initial thumbnail load state if not already set
  if (thumbnailLoadState === undefined) {
    imageCtx.setThumbnailLoadStatus(image.id, 'loading');
  }

  // TODO Prefetch the images
});

// Cleanup on component destruction
onDestroy(() => {
  imageCtx.resetThumbnailLoadStatus(image.id);
});
</script>

<div
  class="relative h-full w-full"
  data-image-id={image.id}
  onmouseenter={() => imageCtx.setActiveImage(image)}
  onclick={() => imageCtx.setActiveImage(image)}>
  <Image
    class="h-50 w-50 mx-auto overflow-hidden rounded-lg border-base-100 text-neutral 
      {image.isPublished ? '' : 'border-2 border-base-200/60 opacity-70'}
      {thumbnailLoadState === 'loading' ? 'opacity-0' : 'opacity-100'}"
    src={getURLfromImage({
      image,
      transformation: 'c_fill,w_200,h_200'
    })}
    alt="thumbnail"
    layout="cover"
    showLoading={false}
    onLoad={() => {
      imageCtx.setThumbnailLoadStatus(image.id, 'loaded');
    }}
    onError={() => {
      imageCtx.setThumbnailLoadStatus(image.id, 'error');
    }} />

  {#if isHighlighted}
    <div
      class="absolute bottom-0 right-0 h-0 w-0 border-b-[20px] border-l-[20px] border-b-primary border-l-transparent">
    </div>
  {/if}

  {#if thumbnailLoadState === 'loaded' && (!actionProps || !actionProps.removeMode) && image.intent}
    <IntentLabel intent={image.intent} {idx} imageId={image.id} />
  {/if}

  {#if thumbnailLoadState === 'loading'}
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
