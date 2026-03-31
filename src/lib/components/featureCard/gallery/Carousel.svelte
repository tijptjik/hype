<script lang="ts">
// GESTURES
import { useSwipe, useTap } from 'svelte-gestures'
// CONTEXT
import { getImageCtx } from '$lib/context/image.svelte'
// NAVIGATION
import { addParamToUrl } from '$lib/navigation'
// COMPONENTS
import PhotoFrame from '$lib/components/common/PhotoFrame.svelte'
import Metadata from '$lib/components/featureCard/gallery/Metadata.svelte'
import Counter from '$lib/components/featureCard/gallery/Counter.svelte'
import StageActions from '$lib/components/featureCard/gallery/StageActions.svelte'
// ICONS
import Icon from '$lib/components/common/Icon.svelte'
import ChevronLeft from 'virtual:icons/lucide/chevron-left'
import ChevronRight from 'virtual:icons/lucide/chevron-right'
// TYPES
import type { SwipeCustomEvent, TapCustomEvent } from 'svelte-gestures'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'

// CONTEXT
const imageCtx = getImageCtx()

// SERVICES
let images: ImageCtxEnvelope[] = $derived(imageCtx.getImages())
let currentImage: ImageCtxEnvelope | null = $derived(imageCtx.activeImage)
let isStaged = $derived(currentImage && imageCtx.isImageStaged(currentImage))

// ELEMENTS
let container: HTMLDivElement

// GESTURE HOOKS
const { swipe: swipeAttach, onswipe } = useSwipe(
  handleSwipe,
  () => ({ timeframe: 300, touchAction: 'manipulation' }),
  undefined,
  true,
)

const { tap: tapAttach, ontap } = useTap(
  handleTap,
  () => ({ timeframe: 300, touchAction: 'manipulation' }),
  undefined,
  true,
)

// STATE : LOCAL - simplified since PhotoFrame handles transitions

// Navigation handlers - much simpler now
function handlePrevious(e: MouseEvent | SwipeCustomEvent) {
  e.preventDefault()
  e.stopPropagation()
  imageCtx.prev()
}

function handleNext(e: MouseEvent | SwipeCustomEvent) {
  e.preventDefault()
  e.stopPropagation()
  imageCtx.next()
}

// Tap gesture handler for image navigation
function handleTap(event: TapCustomEvent) {
  if (images.length === 0) return
  if (images.length === 1 && !isStaged) {
    addParamToUrl('fullscreen', 'true')
    return
  }

  const rect = container.getBoundingClientRect()
  const { x: relativeX } = event.detail
  const leftBoundary = rect.width * (isStaged ? 0.5 : 0.25)
  const rightBoundary = rect.width * (isStaged ? 0.5 : 0.75)

  if (relativeX < leftBoundary) {
    // Left quarter - previous image
    imageCtx.prev()
  } else if (relativeX > rightBoundary) {
    // Right quarter - next image
    imageCtx.next()
  } else if (!isStaged) {
    // Center half - open full screen
    addParamToUrl('fullscreen', 'true')
  }
}

function handleSwipe(e: SwipeCustomEvent) {
  if (images.length <= 1) return

  const { direction } = e.detail

  if (direction === 'left') {
    handlePrevious(e)
  } else if (direction === 'right') {
    handleNext(e)
  }
}
</script>

<div
  class="relative h-full w-full transition-all duration-300 focus:border-0 focus:outline-none focus:ring-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0"
  bind:this={container}
>
  <!-- Navigation buttons - only show if more than one image -->
  {#if images.length > 1}
    <button
      class="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white hover:bg-black/70"
      onclick={handlePrevious}
      aria-label="Previous image"
    >
      <Icon src={ChevronLeft} class="h-4 w-4" />
    </button>

    <button
      class="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white hover:bg-black/70"
      onclick={handleNext}
      aria-label="Next image"
    >
      <Icon src={ChevronRight} class="h-4 w-4" />
    </button>
  {/if}

  <!-- PhotoFrame handles all image display and transitions -->
  <PhotoFrame
    class="h-full w-full"
    mode="carousel"
    layout="contain"
    transitionDuration={300}
  >
    {#snippet children()}
      <!-- Image intent and attribution overlay -->
      {#if currentImage && !imageCtx.isImageStaged(currentImage)}
        <Metadata {currentImage} />
        <Counter {images} {currentImage} />
      {:else if currentImage && imageCtx.isImageStaged(currentImage)}
        <StageActions {currentImage} />
        <Counter {images} {currentImage} />
      {/if}
    {/snippet}
  </PhotoFrame>

  <!-- Tap interaction layer -->
  <div
    id="photo-carousel"
    class="z-5 absolute inset-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0"
    {@attach swipeAttach}
    {@attach tapAttach}
    {onswipe}
    {ontap}
    role="button"
    tabindex="0"
    aria-label="Tap left/right to navigate, center to open full screen"
  ></div>
</div>
