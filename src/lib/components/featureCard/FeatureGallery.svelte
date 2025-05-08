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
</script>

<div
  class="flex-shrink-1 flex-grow-1 pointer-events-auto relative flex min-h-52 w-full basis-[35%] items-center justify-center overflow-hidden bg-base-content/20 backdrop-blur-sm">
  {#if imageCtx.isImagesLoading}
    <div class="flex items-center justify-center">
      <span class="loading loading-ring loading-lg"></span>
    </div>
  {:else if imageCtx.getImages().length > 0 && featureCardContext.state.mode === FeatureCardMode.Display}
    <Carousel />
  {:else}
    <AddPhoto />
  {/if}
</div>
