<script lang="ts">
import { onDestroy } from 'svelte'
import { getFeatureIdenticonUrl } from '$lib/client/services/image'
import type { ImageSurfaceProps } from './imagePrimitives.types'
import {
  backdropImageClass,
  foregroundLayerClass,
  imageStackClass,
  incomingBackdropClass,
  incomingLayerClass,
  loadingBreathLayerClass,
  preloadImageClass,
  rotationOverlayClass,
  surfaceRootClass,
} from './imageSurface.styles'
import ImageSurfaceOverlays from './ImageSurfaceOverlays.svelte'

let {
  item,
  fit = 'fit',
  class: className = '',
  isLoading = false,
  showBackdrop = fit === 'fit',
  enableSourceTransition = true,
  isBlurred = false,
  isGreyscale = false,
  rounded = 'rounded-xl',
  onLoad,
  onError,
}: ImageSurfaceProps = $props()

const SOURCE_TRANSITION_MS = 520
const SKELETON_DELAY_MS = 200
const ROTATION_OVERLAY_FADE_OUT_MS = 140

let hasLoaded = $state(false)
let hasError = $state(false)
let showSkeleton = $state(false)
let skeletonTimer: ReturnType<typeof setTimeout> | null = null
let currentSrc = $state<string | null>(null)
let pendingSrc = $state<string | null>(null)
let incomingSrc = $state<string | null>(null)
let incomingVisible = $state(false)
let transitionTimer: ReturnType<typeof setTimeout> | null = null
let incomingActivationFrame: number | null = null
let rotationOverlaySrc = $state<string | null>(null)
let rotationOverlayDegrees = $state(0)
let rotationOverlayVisible = $state(false)
let rotationOverlayFadeOut = $state(false)
let rotationOverlayActivationFrame: number | null = null
let rotationOverlayFadeTimer: ReturnType<typeof setTimeout> | null = null

const src = $derived(item?.src ?? null)
const sourceFallbackSrc = $derived(item?.sourceFallbackSrc ?? null)
const blurSrc = $derived(item?.blurSrc ?? src)
const alt = $derived(item?.alt ?? '')
const fallbackSrc = $derived(
  getFeatureIdenticonUrl(item?.fallbackSeed ?? item?.id ?? 'gallery-fallback'),
)
const effectiveSrc = $derived(src ?? sourceFallbackSrc ?? fallbackSrc)
const backdropSrc = $derived(blurSrc ?? sourceFallbackSrc ?? src ?? fallbackSrc)
const shouldShowBackdrop = $derived(
  Boolean(src || sourceFallbackSrc) && fit === 'fit' && showBackdrop,
)
const shouldShowFallbackBackdrop = $derived(
  Boolean(sourceFallbackSrc) &&
    (currentSrc !== sourceFallbackSrc || !hasLoaded || hasError) &&
    (incomingSrc || pendingSrc || currentSrc === sourceFallbackSrc || !currentSrc),
)
const shouldShowFallbackForeground = $derived(
  Boolean(sourceFallbackSrc) &&
    (currentSrc !== sourceFallbackSrc || !hasLoaded || hasError) &&
    (!hasLoaded || hasError || incomingSrc || pendingSrc),
)
const uploadStatus = $derived(item?.status?.uploadStatus ?? null)
const rotationDegrees = $derived(item?.rotationDegrees ?? 0)
const animateRotation = $derived(item?.animateRotation ?? false)
const shouldPulseImage = $derived(
  (isLoading || uploadStatus === 'uploading' || uploadStatus === 'finalizing') &&
    hasLoaded &&
    !hasError,
)

/**
 * Ignores stale failures from non-active image elements so only the currently
 * displayed source can move the surface into an error state.
 *
 * @param event - Native image error event from the foreground image.
 * @returns Nothing.
 */
function handleImageError(event: Event): void {
  const image = event.currentTarget as HTMLImageElement | null

  if (
    image &&
    image.currentSrc.length > 0 &&
    image.currentSrc !== (currentSrc ?? effectiveSrc)
  ) {
    return
  }

  hasError = true
  showSkeleton = false
  onError?.()
}

/**
 * Clears the delayed source-transition completion timer.
 *
 * @returns Nothing.
 */
function clearTransitionTimer(): void {
  if (!transitionTimer) return
  clearTimeout(transitionTimer)
  transitionTimer = null
}

/**
 * Clears the deferred activation frame for the incoming source.
 *
 * @returns Nothing.
 */
function clearIncomingActivationFrame(): void {
  if (incomingActivationFrame == null) return
  cancelAnimationFrame(incomingActivationFrame)
  incomingActivationFrame = null
}

/**
 * Clears the deferred activation frame for the rotation overlay.
 *
 * @returns Nothing.
 */
function clearRotationOverlayActivationFrame(): void {
  if (rotationOverlayActivationFrame == null) return
  cancelAnimationFrame(rotationOverlayActivationFrame)
  rotationOverlayActivationFrame = null
}

/**
 * Clears the rotation overlay fade-out timer.
 *
 * @returns Nothing.
 */
function clearRotationOverlayFadeTimer(): void {
  if (!rotationOverlayFadeTimer) return
  clearTimeout(rotationOverlayFadeTimer)
  rotationOverlayFadeTimer = null
}

/**
 * Fully resets the transient rotation overlay state.
 *
 * @returns Nothing.
 */
function clearRotationOverlay(): void {
  clearRotationOverlayActivationFrame()
  clearRotationOverlayFadeTimer()
  rotationOverlaySrc = null
  rotationOverlayDegrees = 0
  rotationOverlayVisible = false
  rotationOverlayFadeOut = false
}

/**
 * Resets the visible load and error flags before a new source begins resolving.
 *
 * @returns Nothing.
 */
function resetSurfaceLoadState(): void {
  hasLoaded = false
  hasError = false
  showSkeleton = false
}

/**
 * Delays skeleton display so fast source swaps do not flash a placeholder.
 *
 * @returns Nothing.
 */
function scheduleSkeletonReveal(): void {
  if (skeletonTimer) {
    clearTimeout(skeletonTimer)
    skeletonTimer = null
  }

  skeletonTimer = setTimeout(() => {
    if (!hasLoaded) {
      showSkeleton = true
    }
    skeletonTimer = null
  }, SKELETON_DELAY_MS)
}

/**
 * Either clears the rotation overlay immediately or fades it out once a newly
 * displayed source has replaced the rotated source it represented.
 *
 * @param nextSrc - Source that has just become the displayed image.
 * @returns Nothing.
 */
function finishRotationOverlayAfterSourceSwap(nextSrc: string): void {
  if (!rotationOverlaySrc || rotationOverlaySrc === nextSrc) {
    return
  }

  if (fit === 'cover') {
    clearRotationOverlay()
    return
  }

  clearRotationOverlayFadeTimer()
  rotationOverlayFadeOut = true
  rotationOverlayFadeTimer = setTimeout(() => {
    clearRotationOverlay()
  }, ROTATION_OVERLAY_FADE_OUT_MS)
}

/**
 * Reuses the current source as a transient overlay so rotation can animate
 * independently from source swaps.
 *
 * @param nextRotationDegrees - Target rotation to animate toward.
 * @returns Nothing.
 */
function startRotationOverlay(nextRotationDegrees: number): void {
  if (!currentSrc) {
    return
  }

  if (rotationOverlaySrc !== currentSrc) {
    clearRotationOverlay()
    rotationOverlaySrc = currentSrc
    rotationOverlayDegrees = 0
    rotationOverlayVisible = true
    rotationOverlayFadeOut = false

    clearRotationOverlayActivationFrame()
    rotationOverlayActivationFrame = requestAnimationFrame(() => {
      rotationOverlayActivationFrame = requestAnimationFrame(() => {
        rotationOverlayDegrees = nextRotationDegrees
        rotationOverlayActivationFrame = null
      })
    })
    return
  }

  clearRotationOverlayFadeTimer()
  rotationOverlayVisible = true
  rotationOverlayFadeOut = false
  rotationOverlayDegrees = nextRotationDegrees
}

/**
 * Commits the incoming source as the displayed source and clears transition
 * bookkeeping once the foreground swap completes.
 *
 * @param nextSrc - Source that should become the active display image.
 * @param _nextRotationDegrees - Unused placeholder preserved for call-site symmetry.
 * @returns Nothing.
 */
function finishDisplayedSourceTransition(
  nextSrc: string,
  _nextRotationDegrees: number,
): void {
  currentSrc = nextSrc
  incomingSrc = null
  pendingSrc = null
  incomingVisible = false
  hasLoaded = true
  hasError = false
  showSkeleton = false
  finishRotationOverlayAfterSourceSwap(nextSrc)
  onLoad?.()
}

/**
 * Starts the foreground source transition when the resolved source changes.
 *
 * @param nextSrc - Source that should fade into the active display slot.
 * @param nextRotationDegrees - Rotation associated with the incoming source.
 * @returns Nothing.
 */
function startDisplayedSourceTransition(
  nextSrc: string,
  nextRotationDegrees: number,
): void {
  if (!enableSourceTransition) {
    finishDisplayedSourceTransition(nextSrc, nextRotationDegrees)
    return
  }

  // Keep the current source mounted while the next source fades in above it.
  incomingSrc = nextSrc
  incomingVisible = false
  hasLoaded = true
  hasError = false
  showSkeleton = false

  clearTransitionTimer()
  clearIncomingActivationFrame()

  if (!currentSrc) {
    finishDisplayedSourceTransition(nextSrc, nextRotationDegrees)
    return
  }

  incomingActivationFrame = requestAnimationFrame(() => {
    incomingActivationFrame = requestAnimationFrame(() => {
      incomingVisible = true
      incomingActivationFrame = null
    })
  })
  transitionTimer = setTimeout(() => {
    finishDisplayedSourceTransition(nextSrc, nextRotationDegrees)
  }, SOURCE_TRANSITION_MS)
}

$effect(() => {
  const nextSrc = effectiveSrc
  const isSameSource = currentSrc === nextSrc && !pendingSrc && !incomingSrc

  // Synchronize the source state machine whenever the resolved image URL changes.
  if (!enableSourceTransition) {
    if (isSameSource) {
      return
    }

    currentSrc = nextSrc
    pendingSrc = null
    incomingSrc = null
    resetSurfaceLoadState()
    scheduleSkeletonReveal()

    return
  }

  if (!currentSrc) {
    currentSrc = nextSrc
    pendingSrc = null
  } else if (currentSrc !== nextSrc) {
    pendingSrc = nextSrc
    return
  } else if (isSameSource) {
    return
  }

  resetSurfaceLoadState()
  scheduleSkeletonReveal()
})

$effect(() => {
  const nextRotationDegrees = rotationDegrees ?? 0
  const isWaitingToSwapSource = (effectiveSrc ?? null) !== currentSrc

  // Defer rotation overlay work until the visible source has settled.
  if (isWaitingToSwapSource || pendingSrc || incomingSrc) {
    return
  }

  if (animateRotation && currentSrc && rotationOverlayDegrees !== nextRotationDegrees) {
    startRotationOverlay(nextRotationDegrees)
    return
  }
})

onDestroy(() => {
  if (skeletonTimer) {
    clearTimeout(skeletonTimer)
  }
  clearTransitionTimer()
  clearIncomingActivationFrame()
  clearRotationOverlay()
})
</script>

<div class={surfaceRootClass(rounded, className)}>
  {#if shouldShowBackdrop && (!sourceFallbackSrc || (!incomingSrc && !pendingSrc && currentSrc !== sourceFallbackSrc))}
    <img src={backdropSrc} alt="" aria-hidden="true" class={backdropImageClass()}>
  {/if}

  {#if shouldShowBackdrop && shouldShowFallbackBackdrop && sourceFallbackSrc}
    <img src={sourceFallbackSrc} alt="" aria-hidden="true" class={backdropImageClass()}>
  {/if}

  {#if shouldShowBackdrop && incomingSrc}
    <img
      src={incomingSrc}
      alt=""
      aria-hidden="true"
      class={incomingBackdropClass(incomingVisible)}
    >
  {/if}

  <div class="absolute inset-0 flex items-center justify-center">
    <div class={imageStackClass()}>
      {#if shouldShowFallbackForeground && sourceFallbackSrc}
        <img
          src={sourceFallbackSrc}
          alt=""
          aria-hidden="true"
          class={foregroundLayerClass({
            fit,
            isBlurred,
            isGreyscale,
            animateRotation: false,
          })}
        >
      {/if}

      <img
        src={currentSrc ?? effectiveSrc}
        alt={alt || ''}
        class={foregroundLayerClass({
          fit,
          isBlurred,
          isGreyscale,
          animateRotation,
          isHidden: Boolean(rotationOverlaySrc && rotationOverlayVisible),
        })}
        onload={event => {
          hasLoaded = true
          hasError = false
          showSkeleton = false
          onLoad?.()
        }}
        onerror={handleImageError}
      >

      <img
        src={currentSrc ?? effectiveSrc}
        alt=""
        aria-hidden="true"
        class={loadingBreathLayerClass({
          fit,
          isBlurred,
          isGreyscale,
          isVisible: shouldPulseImage && !Boolean(rotationOverlaySrc && rotationOverlayVisible),
        })}
      >

      {#if rotationOverlaySrc && rotationOverlayVisible}
        {#key rotationOverlaySrc}
          <img
            src={rotationOverlaySrc}
            alt=""
            aria-hidden="true"
            style={`transform: rotate(${rotationOverlayDegrees}deg);`}
            class={rotationOverlayClass({
              fit,
              isBlurred,
              isGreyscale,
              isFadingOut: rotationOverlayFadeOut,
            })}
          >
        {/key}
      {/if}

      {#if incomingSrc && enableSourceTransition}
        <img
          src={incomingSrc}
          alt={alt || ''}
          class={incomingLayerClass({
            fit,
            isBlurred,
            isGreyscale,
            animateRotation,
            isVisible: incomingVisible,
          })}
          aria-hidden="true"
        >

        <img
          src={incomingSrc}
          alt=""
          aria-hidden="true"
          class={loadingBreathLayerClass({
            fit,
            isBlurred,
            isGreyscale,
            isVisible: shouldPulseImage && incomingVisible,
          })}
        >
      {/if}
    </div>

    {#if pendingSrc && enableSourceTransition}
      <img
        src={pendingSrc}
        alt=""
        aria-hidden="true"
        class={preloadImageClass()}
        onload={async event => {
          const image = event.currentTarget as HTMLImageElement

          try {
            if (typeof image.decode === 'function') {
              await image.decode()
            }
          } catch {
            // Firefox can reject decode() even when an already-loaded image is paintable.
          }

          startDisplayedSourceTransition(pendingSrc, rotationDegrees ?? 0)
        }}
        onerror={() => {
          pendingSrc = null
        }}
      >
    {/if}
  </div>

  <ImageSurfaceOverlays {showSkeleton} {hasLoaded} {hasError} />
</div>
