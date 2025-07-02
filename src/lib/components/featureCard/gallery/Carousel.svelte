<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getFeatureCardContext } from '$lib/context/featureCard.svelte';
import { getImageContext } from '$lib/context/image.svelte';
import { getAppCtx } from '$lib/context/app.svelte';
// COMPONENTS
import AddPhoto from '$lib/components/featureCard/gallery/AddPhoto.svelte';
import PhotoFrame from '$lib/components/common/PhotoFrame.svelte';
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronLeft, ChevronRight, Camera, MapPin } from '@steeze-ui/heroicons';
// SERVICES
import { formatDate } from '$lib';
import type { Image } from '$lib/types';

// CONTEXT
const imageCtx = getImageContext();
const cardCtx = getFeatureCardContext();
const appCtx = getAppCtx();

// SERVICES
let images: Image[] = $derived(imageCtx.getImages());
let currentImage: Image | null = $derived(imageCtx.activeImage);

// ELEMENTS
let container: HTMLDivElement;

// STATE : LOCAL - simplified since PhotoFrame handles transitions
let showContributor = $state(false);
let toggleAttribution = () => {
  showContributor = !showContributor;
};

const feature = $derived(appCtx.getFeatureById(imageCtx.state.context?.ctxId));
const contributorName = $derived(feature?.contributor?.name);
const createdAt = $derived(feature?.createdAt);

// Navigation handlers - much simpler now
function handlePrevious(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  imageCtx.prev();
}

function handleNext(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  imageCtx.next();
}

function handleTouch(event: TouchEvent | MouseEvent) {
  if (images.length <= 1) return;

  const rect = container.getBoundingClientRect();
  const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
  const relativeX = clientX - rect.left;
  const isLeftHalf = relativeX < rect.width / 2;

  if (isLeftHalf) {
    imageCtx.prev();
  } else {
    imageCtx.next();
  }
}
</script>

<div class="relative h-full w-full transition-all duration-300" bind:this={container}>
  <!-- Navigation buttons - only show if more than one image -->
  {#if images.length > 1}
    <button
      class="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
      onclick={handlePrevious}
      aria-label="Previous image">
      <Icon src={ChevronLeft} class="h-4 w-4" />
    </button>

    <button
      class="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
      onclick={handleNext}
      aria-label="Next image">
      <Icon src={ChevronRight} class="h-4 w-4" />
    </button>
  {/if}

  <!-- PhotoFrame handles all image display and transitions -->
  {#if cardCtx.isDisplayMode}
    <PhotoFrame
      class="h-full w-full"
      mode="carousel"
      layout="contain"
      transitionDuration={300}>
      {#snippet children()}
        <!-- Image intent and attribution overlay -->
        {#if currentImage}
          <Metadata {currentImage} />
          <Counter {images} {currentImage} />
        {/if}
      {/snippet}
    </PhotoFrame>
  {/if}

  <!-- Tap interaction layer -->
  {#if images.length > 1}
    <div
      class="z-5 absolute inset-0"
      use:tap={() => ({ timeframe: 300, touchAction: 'manipulation' })}
      ontap={handleTap}
      role="button"
      tabindex="0"
      aria-label="Tap left/right to navigate, center to open full screen">
    </div>
  {:else if cardCtx.isAddPhotoMode || cardCtx.isNewMode || cardCtx.isMissingMode}
    <AddPhoto />
  {/if}
</div>
