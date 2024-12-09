<script lang="ts">
import { fade } from 'svelte/transition';
// LIB
import {
  getURLfromImage,
  imageSets,
  selectActiveImage
} from '$lib/images/index.svelte';
// COMPONENTS
import Image from '$lib/components/common/Image.svelte';
import IntentLabel from '$lib/components/images/IntentLabel.svelte';
import Loading from '$lib/components/images/gallery/overlays/Loading.svelte';
import Deletion from '$lib/components/images/gallery/overlays/Delete.svelte';
import Confirmation from '$lib/components/images/gallery/overlays/Confirmation.svelte';
import Deleting from '$lib/components/images/gallery/overlays/Deleting.svelte';
// TYPES
import type { GetImageAPI, ImageEditRefs } from '$lib/types';

type Props = {
  image: GetImageAPI;
  idx: number;
  actionProps?: { removeMode: boolean };
  refs: ImageEditRefs;
};

let { image, idx, actionProps, refs }: Props = $props();

// Initialize load state for this thumbnail
$effect(() => {
  // Set initial load state if not already set
  if (imageSets.imageLoadStates[image.id] === undefined) {
    imageSets.imageLoadStates[image.id] = 'loading';
  }
});
</script>

<div
  class="h-full w-full"
  data-image-id={image.id}
  onmouseenter={() => selectActiveImage(image)}
  onclick={() => selectActiveImage(image)}>
  <Image
    class="h-50 w-50 mx-auto overflow-hidden rounded-lg text-neutral border-base-100 {image.isPublished
      ? ''
      : 'opacity-70 border-base-200/60 border-2'}
      {image == imageSets.activeImage
      ? ''
      : ''}
      "
    src={getURLfromImage({
      image,
      transformation: 'c_fill,w_200,h_200'
    })}
    alt="thumbnail"
    layout="cover"
    showLoading={false}
    onLoad={() => {
      imageSets.imageLoadStates[image.id] = 'loaded';
      imageSets.imagesLoaded[image.id] = true;
    }}
    onError={() => {
      imageSets.imageLoadStates[image.id] = 'error';
      imageSets.imagesLoaded[image.id] = true;
    }} />

  {#if imageSets.imagesLoaded[image.id] && (!actionProps || !actionProps.removeMode)}
    <IntentLabel
      intent={image.intent}
      {idx}
      imageId={image.id}
      images={imageSets.images}
      {refs} />
  {/if}

  {#if !imageSets.imagesLoaded[image.id]}
    <Loading />
  {:else if actionProps}
    {#if actionProps.removeMode && imageSets.imagesLoaded[image.id] && !imageSets.imagesPendingConfirmation.has(image.id) && !imageSets.imagesToDelete.has(image.id)}
      <Deletion {image} />
    {:else if imageSets.imagesPendingConfirmation.has(image.id) && !imageSets.imagesToDelete.has(image.id)}
      <Confirmation {image} {refs} />
    {:else if imageSets.imagesToDelete.has(image.id)}
      <Deleting {image} />
    {/if}
  {/if}
</div>
