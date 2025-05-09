<script lang="ts">
// ENUMS
import { FeatureCardMode } from '$lib/types';
// COMPONENTS
import AddPhoto from './gallery/AddPhoto.svelte';
import Carousel from './gallery/Carousel.svelte';
// CONTEXT
import { getFeatureCardContext } from '$lib/context/featureCard.svelte';
// SERVICES
import { getImageContext } from '$lib/context/images.svelte';
// CONTEXT
const featureCardContext = getFeatureCardContext();

const imageCtx = getImageContext();

const { isCameraActive = false, isSingleImage = false } = $props();
</script>

<div
  class="flex-grow-1 flex-shrink-5 pointer-events-auto relative flex min-h-56 w-full basis-[448px] items-center justify-center overflow-hidden bg-base-content/20 backdrop-blur-sm transition-all duration-300">
  {#if imageCtx.isImagesLoading}
    <div class="flex items-center justify-center">
      <span class="loading loading-ring loading-lg"></span>
    </div>
  {:else if imageCtx.getImages().length > 0 && featureCardContext.state.mode === FeatureCardMode.Display}
    <Carousel />
  {:else}
    <AddPhoto {isCameraActive} {isSingleImage} />
  {/if}
</div>
