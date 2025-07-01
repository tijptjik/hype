<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getFeatureCardContext } from '$lib/context/featureCard.svelte';
import { getImageContext } from '$lib/context/image.svelte';
import { getAppContext } from '$lib/context/app.svelte';
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
const appCtx = getAppContext();

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
    <div class="absolute z-20 hidden h-full w-full">
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
    </div>
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
          <div
            class="absolute bottom-2 left-2 z-10 flex h-6 select-none flex-row gap-2 overflow-visible caret-transparent">
            <div
              class="absolute z-30 flex w-64 -translate-y-[120px] flex-col items-start justify-start gap-1.5">
              <div
                class="h-6 {showContributor
                  ? 'translate-y-0 opacity-100 delay-150'
                  : 'translate-y-24 opacity-0 delay-0'} flex gap-2 rounded bg-black/80 px-2 py-1 font-mono text-xs text-white transition-all duration-300">
                <Icon src={MapPin} class="h-4 w-4" />
                <span>{m.clear_patchy_bobcat_wish()}</span>
                <span class="font-bold">
                  {contributorName || m.whole_upper_quail_bloom()}
                </span>
              </div>
              <div
                class="h-6 {showContributor
                  ? 'translate-y-0 opacity-100 delay-100'
                  : 'translate-y-18 delay-50 opacity-0'} rounded bg-black/80 px-2 py-1 font-mono text-xs text-white transition-all duration-300">
                <span>{m.fluffy_fresh_ant_aim()} </span>
                <span class="font-bold">
                  {formatDate(createdAt ?? '')}
                </span>
              </div>
              <div
                class="h-6 {showContributor
                  ? 'delay-50 translate-y-0 opacity-100'
                  : 'translate-y-12 opacity-0 delay-100'} flex gap-2 rounded bg-black/80 px-2 py-1 font-mono text-xs text-white transition-all duration-300">
                <Icon src={Camera} class="h-4 w-4" />
                <span>{m.clear_patchy_bobcat_wish()}</span>
                <span class="font-bold">
                  {currentImage.attribution ||
                    currentImage.credit ||
                    m.whole_upper_quail_bloom()}
                </span>
              </div>
              <div
                class="h-6 {showContributor
                  ? 'translate-y-0 opacity-100 delay-0'
                  : 'translate-y-6 opacity-0 delay-150'} rounded bg-black/80 px-2 py-1 font-mono text-xs text-white transition-all duration-300">
                <span>{m.fluffy_fresh_ant_aim()} </span>
                <span class="font-bold">
                  {formatDate(currentImage.capturedAt ?? currentImage.createdAt ?? '')}
                </span>
              </div>
            </div>
            <div
              class="z-40 cursor-pointer rounded bg-black/50 px-1.5 py-1 text-xs text-white"
              onmouseenter={toggleAttribution}
              onmouseleave={toggleAttribution}
              ontouchstart={toggleAttribution}
              onkeydown={toggleAttribution}>
              ⓘ
            </div>

            <!-- Intent display - simplified since we don't have intent property in ImageDB -->
            <div class="grid grid-cols-1 grid-rows-1">
              <div
                class="grid-row-1 grid-col-1 h-6 rounded bg-black/50 px-2 py-1 font-mono text-xs text-white">
                {currentImage.intent}
              </div>
            </div>
          </div>

          <!-- Image counter - only show if more than one image -->
          {#if images.length > 1}
            <div
              class="absolute bottom-2 right-2 z-10 rounded bg-black/50 px-2 py-1 text-xs text-white">
              {currentImage
                ? images.findIndex((img) => img.id === currentImage?.id) + 1
                : 0} / {images.length}
            </div>
          {/if}
        {/if}
      {/snippet}
    </PhotoFrame>
  {/if}

  <!-- Touch interaction layer -->
  {#if images.length > 1}
    <div
      class="z-5 absolute inset-0"
      ontouchstart={handleTouch}
      onclick={handleTouch}
      role="button"
      tabindex="0"
      aria-label="Tap left or right to navigate images">
    </div>
  {:else if cardCtx.isAddPhotoMode || cardCtx.isNewMode || cardCtx.isMissingMode}
    <AddPhoto />
  {/if}
</div>
