<script lang="ts">
import { onMount } from 'svelte';
// SERVICES
import { getImageService, getURLfromImage } from '$lib/context/images.svelte';
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
const imageService = getImageService();

type Props = {
  image: GetImageAPI;
  idx: number;
  actionProps?: { removeMode: boolean };
};

let { image, idx, actionProps }: Props = $props();

let imageLoadState = $derived(imageService.getLoadStatus(image.id));

// Initialize load state for this thumbnail
onMount(() => {
  // Set initial load state if not already set
  if (imageLoadState === undefined) {
    console.log('THUMBNAIL :: setting image load state to loading', image.id);
    imageService.setLoadStatus(image.id, 'loading');
  }
});
</script>

<div
  class="h-full w-full"
  data-image-id={image.id}
  onmouseenter={() => imageService.setActiveImage(image)}
  onclick={() => imageService.setActiveImage(image)}>
  <Image
    class="h-50 w-50 mx-auto overflow-hidden rounded-lg border-base-100 text-neutral {image.isPublished
      ? ''
      : 'border-2 border-base-200/60 opacity-70'}
      {image == imageService.getActiveImage() ? '' : ''}
      "
    src={getURLfromImage({
      image,
      transformation: 'c_fill,w_200,h_200'
    })}
    alt="thumbnail"
    layout="cover"
    showLoading={false}
    onLoad={() => {
      console.log(
        'THUMBNAIL :: IMAGE :: OnLoad :: setting image load state to loaded',
        image.id
      );
      imageService.setLoadStatus(image.id, 'loaded');
    }}
    onError={() => {
      imageService.setLoadStatus(image.id, 'error');
    }} />

  {#if imageLoadState === 'loaded' && (!actionProps || !actionProps.removeMode)}
    <IntentLabel intent={image.intent} {idx} imageId={image.id} />
  {/if}

  {#if imageLoadState === 'loading'}
    <Loading />
  {:else if actionProps}
    {#if actionProps.removeMode && imageLoadState === 'loaded' && !imageService.pendingConfirmationHas(image.id) && !imageService.deletionQueueHas(image.id)}
      <Deletion {image} />
    {:else if imageService.pendingConfirmationHas(image.id) && !imageService.deletionQueueHas(image.id)}
      <Confirmation {image} />
    {:else if imageService.deletionQueueHas(image.id)}
      <Deleting />
    {/if}
  {/if}
</div>
