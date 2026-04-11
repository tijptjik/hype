<script lang="ts">
// COMPONENTS
import XIcon from 'virtual:icons/lucide/x'
// STYLES
import {
  getDecorativeImageStyle,
  getDismissButtonStyle,
} from '../hubSubscriptionOverlay.styles'
// TYPES
import type { DecorativeFeatureImage } from '../hubSubscriptionOverlay.utils'

type Props = {
  decorativeFeatureImages: DecorativeFeatureImage[]
  areDecorativeImagesExpanded?: boolean
  isCardSurfaceExpanded?: boolean
  dismissText?: string
  isLoading?: boolean
  isDisabled?: boolean
  onDismiss?: () => void | Promise<void>
  onReady?: () => void
  children?: import('svelte').Snippet
}

let {
  decorativeFeatureImages,
  areDecorativeImagesExpanded = false,
  isCardSurfaceExpanded = false,
  dismissText = 'Close',
  isLoading = false,
  isDisabled = false,
  onDismiss,
  onReady,
  children,
}: Props = $props()

let cardCircleElement = $state<HTMLDivElement | null>(null)
let loadedFeatureImageIds = $state<Record<string, boolean>>({})
let failedFeatureImageIds = $state<Record<string, boolean>>({})
let activeDecorativeImageIndex = $state<number | null>(null)

const DECORATIVE_IMAGE_HOVER_OFFSET_RATIO = 0.18
const DECORATIVE_IMAGE_ORBIT_RADIUS_PX = 254
const DISMISS_BUTTON_ANGLE_DEGREES = -45
const DISMISS_BUTTON_ORBIT_RADIUS_PX = 242
const decorativeImageSettleCount = $derived(
  Object.keys(loadedFeatureImageIds).length + Object.keys(failedFeatureImageIds).length,
)

$effect(() => {
  if (
    decorativeFeatureImages.length === 0 ||
    decorativeImageSettleCount < decorativeFeatureImages.length
  ) {
    return
  }

  onReady?.()
})

function handleDecorativeImageLoad(imageId: string): void {
  loadedFeatureImageIds = {
    ...loadedFeatureImageIds,
    [imageId]: true,
  }
}

function handleDecorativeImageError(imageId: string): void {
  failedFeatureImageIds = {
    ...failedFeatureImageIds,
    [imageId]: true,
  }
}

// Determine which orbit image should react to the current pointer direction.
function handleCardCirclePointerMove(event: PointerEvent): void {
  if (!cardCircleElement || decorativeFeatureImages.length === 0) {
    activeDecorativeImageIndex = null
    return
  }

  const rect = cardCircleElement.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const pointerX = event.clientX - centerX
  const pointerY = event.clientY - centerY
  const pointerRadius = Math.hypot(pointerX, pointerY)

  if (pointerRadius > rect.width / 2) {
    activeDecorativeImageIndex = null
    return
  }

  const pointerAngle = Math.atan2(pointerY, pointerX)
  let closestIndex = 0
  let closestDelta = Number.POSITIVE_INFINITY

  for (const image of decorativeFeatureImages) {
    const imageAngle =
      ((-90 + (360 / decorativeFeatureImages.length) * image.index) * Math.PI) / 180
    const wrappedDelta = Math.abs(
      Math.atan2(
        Math.sin(pointerAngle - imageAngle),
        Math.cos(pointerAngle - imageAngle),
      ),
    )

    if (wrappedDelta < closestDelta) {
      closestDelta = wrappedDelta
      closestIndex = image.index
    }
  }

  activeDecorativeImageIndex = closestIndex
}

function handleCardCirclePointerLeave(): void {
  activeDecorativeImageIndex = null
}
</script>

<div
  bind:this={cardCircleElement}
  class="relative aspect-square w-full"
  onpointermove={handleCardCirclePointerMove}
  onpointerleave={handleCardCirclePointerLeave}
>
  {#each decorativeFeatureImages as featureImage (featureImage.id)}
    <div
      class={`absolute z-0 size-32 overflow-hidden rounded-full border border-[color-mix(in_oklab,var(--color-map-base)_48%,white_10%)] transition-[transform,opacity] duration-[500ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${loadedFeatureImageIds[featureImage.id] && !failedFeatureImageIds[featureImage.id] ? 'opacity-100' : 'opacity-0'}`}
      style={getDecorativeImageStyle({
        index: featureImage.index,
        count: decorativeFeatureImages.length,
        orbitRadius: DECORATIVE_IMAGE_ORBIT_RADIUS_PX,
        hoverOffsetRatio: DECORATIVE_IMAGE_HOVER_OFFSET_RATIO,
        isExpanded: areDecorativeImagesExpanded,
        activeIndex: activeDecorativeImageIndex,
      })}
      aria-hidden="true"
    >
      <img
        src={featureImage.src}
        alt=""
        class="h-full w-full rotate-[var(--decorative-image-rotation)] object-cover saturate-[0.9] contrast-[1.02]"
        loading="lazy"
        decoding="async"
        onload={() => handleDecorativeImageLoad(featureImage.id)}
        onerror={() => handleDecorativeImageError(featureImage.id)}
      >
      <div
        class="absolute inset-0 bg-[color-mix(in_oklab,var(--color-map-primary)_18%,transparent)] mix-blend-soft-light"
      ></div>
    </div>
  {/each}

  <button
    type="button"
    class="absolute z-20 flex size-11 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--color-map-base)_34%,white_10%)] bg-[color-mix(in_oklab,var(--color-base-400)_90%,var(--color-map-primary)_10%)] text-white/84 transition-[transform,opacity,border-color,background-color,color] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[color-mix(in_oklab,var(--color-map-primary)_34%,white_8%)] hover:bg-[color-mix(in_oklab,var(--color-map-primary)_14%,var(--color-base-400))] hover:text-white disabled:pointer-events-none disabled:opacity-48"
    style={getDismissButtonStyle({
      angleDegrees: DISMISS_BUTTON_ANGLE_DEGREES,
      orbitRadius: DISMISS_BUTTON_ORBIT_RADIUS_PX,
      isExpanded: isCardSurfaceExpanded,
    })}
    aria-label={dismissText}
    title={dismissText}
    disabled={isDisabled || isLoading}
    onclick={() => onDismiss?.()}
  >
    <XIcon class="size-5" />
  </button>

  {@render children?.()}
</div>
