<script lang="ts">
// ENUMS
import { FeatureCardMode } from '$lib/enums';
// COMPONENTS
import AddPhoto from './gallery/AddPhoto.svelte';
import Carousel from './gallery/Carousel.svelte';
// CONTEXT
import { getFeatureCardContext } from '$lib/context/featureCard.svelte';
// SERVICES
import { getImageContext } from '$lib/context/image.svelte';
// CONTEXT
const cardCtx = getFeatureCardContext();

const imageCtx = getImageContext();

const { isCameraActive = false, isSingleImage = false } = $props();
</script>

<div
  class="flex-grow pointer-events-auto relative flex w-full aspect-square items-center justify-center overflow-hidden bg-base-content/20 caret-transparent backdrop-blur-sm transition-all duration-300 {cardCtx.state.mode === FeatureCardMode.Display ? 'min-h-56 flex-shrink' : 'min-h-64 flex-shrink-0'}">
  {#if imageCtx.isImagesLoading}
    <div class="flex items-center justify-center">
      <span class="loading loading-ring loading-lg"></span>
    </div>
  {:else if imageCtx.getImages().length > 0 && cardCtx.state.mode === FeatureCardMode.Display}
    <Carousel />
  {:else}
    <AddPhoto {isCameraActive} {isSingleImage} />
  {/if}
</div>
