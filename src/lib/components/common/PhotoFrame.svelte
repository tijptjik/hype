<script lang="ts">
// SVELTE
import { untrack, onDestroy } from 'svelte'
// I18N
import { m } from '$lib/i18n'
// SERVICES
import { getImageCtx } from '$lib/context/image.svelte'
import { getURLfromImage } from '$lib/client/services/image'
// COMPONENTS
import Picture from '$lib/components/common/Picture.svelte'
import Loading from '$lib/components/images/gallery/overlays/Loading.svelte'
// TYPES
import { type Snippet } from 'svelte'
import type { Image } from '$lib/types'

type DisplayImage = {
  id: string
  src: string | undefined
  isPreview: boolean
  image?: Image
}

type Props = {
  class?: string
  layout?: 'cover' | 'fill' | 'fit' | 'contain'
  mode?: 'standalone' | 'carousel' | 'gallery'
  showLoading?: boolean
  showError?: boolean
  showBackground?: boolean
  transitionDuration?: number
  transformation?: string
  children?: Snippet
}

const imageCtx = getImageCtx()

let {
  class: className = '',
  layout = 'contain',
  mode = 'standalone',
  showLoading = true,
  showError = true,
  showBackground = true,
  transitionDuration = 500,
  transformation,
  children,
}: Props = $props()

// Simplified state for crossfade transitions
let baseImage = $state<DisplayImage | null>(null)
let overlayImage = $state<DisplayImage | null>(null)
let isTransitioning = $state(false)
let overlayOpacity = $state(0)
let animationId = $state<number | null>(null)
let timeoutId = $state<ReturnType<typeof setTimeout> | null>(null)

// Generate alt text
let altText = $derived(baseImage ? `Image ${baseImage.id}` : 'No image')

function getDisplayImageFromPreview(preview: any): DisplayImage {
  return {
    id: `preview-${preview.file.name}`,
    src: preview.preview,
    isPreview: true,
  }
}

function getDisplayImageFromActiveImage(
  activeImage: Image,
  transformation?: string,
): DisplayImage {
  return {
    id: activeImage.id,
    src: getURLfromImage({ image: activeImage, transformation }),
    isPreview: false,
    image: activeImage,
  }
}

// Determine what should be displayed based on current state
function getDisplayImage(
  viewerState: string,
  activeImage: Image | null,
  activePreview: any,
): DisplayImage | null {
  // Priority 1: Show preview during upload states
  if (viewerState === 'previewUploading' && activePreview?.preview) {
    return getDisplayImageFromPreview(activePreview)
  }
  // Priority 2: Show preview during replacement
  if (viewerState === 'previewReplacement' && activePreview?.preview) {
    return getDisplayImageFromPreview(activePreview)
  }
  // Priority 3: Show preview during transition state (replacement upload complete but not loaded)
  if (viewerState === 'transition' && activePreview?.preview) {
    return getDisplayImageFromPreview(activePreview)
  }
  // Priority 4: Show active image (could be API image or staged image with preview)
  if (activeImage) {
    return getDisplayImageFromActiveImage(activeImage, transformation)
  }
  // Priority 5: No image
  return null
}

// Simple crossfade transition logic
$effect(() => {
  // Only track the inputs that should trigger a new transition
  const activeImage = imageCtx.activeImage
  const activePreview = imageCtx.activePreview

  untrack(() => {
    const viewerState = imageCtx.viewerState // Get viewerState inside untrack
    const newDisplayImage = getDisplayImage(viewerState, activeImage, activePreview)

    // No display image - clear everything
    if (!newDisplayImage) {
      if (animationId !== null) {
        cancelAnimationFrame(animationId)
        animationId = null
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      baseImage = null
      overlayImage = null
      isTransitioning = false
      overlayOpacity = 0
      return
    }

    // No base image - set directly (first load)
    if (!baseImage) {
      baseImage = newDisplayImage
      return
    }

    // Same image - no change needed
    if (newDisplayImage.id === baseImage.id) {
      return
    }

    // Different image - start crossfade
    // Cancel any existing animation and timeout
    if (animationId !== null) {
      cancelAnimationFrame(animationId)
      animationId = null
    }
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }

    // Set up crossfade: overlayImage is the NEW image fading IN
    overlayImage = newDisplayImage
    isTransitioning = true
    overlayOpacity = 0

    // Simple crossfade animation
    const startTime = performance.now()
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / transitionDuration, 1)

      overlayOpacity = progress

      if (progress < 1) {
        animationId = requestAnimationFrame(animate)
      } else {
        // Complete: overlayImage becomes the new baseImage
        baseImage = overlayImage
        timeoutId = setTimeout(() => {
          overlayImage = null
          isTransitioning = false
          overlayOpacity = 0
          animationId = null
          timeoutId = null
        }, 500)
      }
    }

    animationId = requestAnimationFrame(animate)
  })
})

// Cleanup on component destroy
onDestroy(() => {
  if (animationId !== null) {
    cancelAnimationFrame(animationId)
  }
  if (timeoutId !== null) {
    clearTimeout(timeoutId)
  }
})

// Preload adjacent images for smooth navigation
$effect(() => {
  const activeImage = imageCtx.activeImage

  if (activeImage && mode !== 'standalone') {
    const images = imageCtx.getImages()
    const currentIndex = images.findIndex(img => img.id === activeImage.id)

    if (currentIndex !== -1) {
      // Preload next and previous images
      const nextIndex = (currentIndex + 1) % images.length
      const prevIndex = (currentIndex - 1 + images.length) % images.length

      ;[images[nextIndex], images[prevIndex]].forEach(img => {
        if (img) {
          const src = getURLfromImage({ image: img, transformation })
          imageCtx.preloadImage(src)
        }
      })
    }
  }
})

// Calculate opacity for preview images during upload
function getImageOpacity(
  displayImage: DisplayImage | null,
  transitionOpacity: number = 1,
): number {
  if (!displayImage) return transitionOpacity

  // Slightly reduce opacity for uploading previews
  if (displayImage.isPreview) {
    const isUploading =
      imageCtx.viewerState === 'previewUploading' ||
      imageCtx.viewerState === 'previewReplacement'
    return isUploading ? 0.8 * transitionOpacity : transitionOpacity
  }

  return transitionOpacity
}
</script>

<div class="relative {className}" style="transition-duration: {transitionDuration}ms;">
  <!-- Base Image -->
  {#if baseImage && baseImage.src}
    <Picture
      src={baseImage?.src || ''}
      alt={altText}
      {layout}
      showLoading={false}
      {showError}
      {showBackground}
      opacity={getImageOpacity(
        baseImage,
        isTransitioning && overlayImage ? 1 - overlayOpacity : 1
      )}
      onLoad={() => {
        if (!baseImage?.isPreview && baseImage?.image) {
          imageCtx.setLoadStatus(baseImage?.image.id, 'loaded');
        }
      }}
      onError={() => {
        if (!baseImage?.isPreview && baseImage?.image) {
          imageCtx.setLoadStatus(baseImage?.image.id, 'error');
        }
      }}
    />
  {/if}

  <!-- Overlay Image (during crossfade transition) -->
  {#if overlayImage && overlayImage.src && isTransitioning}
    <div class="absolute inset-0">
      <Picture
        src={overlayImage?.src || ''}
        alt={m.last_born_anaconda_cuddle() + ' ' + overlayImage.id}
        {layout}
        showLoading={false}
        {showError}
        {showBackground}
        opacity={getImageOpacity(overlayImage, overlayOpacity)}
        onLoad={() => {
          if (!overlayImage?.isPreview && overlayImage?.image) {
            imageCtx.setLoadStatus(overlayImage?.image.id, 'loaded');
          }
        }}
        onError={() => {
          if (!overlayImage?.isPreview && overlayImage?.image) {
            imageCtx.setLoadStatus(overlayImage?.image.id, 'error');
          }
        }}
      />
    </div>
  {/if}

  {#if !baseImage && !overlayImage && !isTransitioning && showLoading && imageCtx.viewerState === 'loading'}
    <Loading />
  {/if}

  <!-- Content overlay -->
  {#if children}
    <div class="z-1 absolute inset-0">{@render children()}</div>
  {/if}
</div>
