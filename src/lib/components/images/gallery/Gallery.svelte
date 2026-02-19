<script lang="ts">
import { fade } from 'svelte/transition'
import { flip } from 'svelte/animate'
// SERVICES
import { getImageCtx } from '$lib/context/image.svelte'
// COMPONENTS :: GALLERY
import Thumbnail from '$lib/components/images/gallery/Thumbnail.svelte'
import UploadThumbnail from '$lib/components/images/gallery/ThumbnailWhileUploading.svelte'
import ScrollArrow from '$lib/components/images/gallery/ScrollArrow.svelte'
import Dropzone from '$lib/components/images/gallery/Dropzone.svelte'
// TYPES
import type { ImageUpload } from '$lib/types'

// SERVICES
const imageCtx = getImageCtx()

type Props = {
  inputElement?: HTMLInputElement
  actionProps?: {
    removeMode: boolean
  }
  hasDropzone?: boolean
  orientation?: 'horizontal' | 'vertical'
}

// STATE :: PROPS
let {
  inputElement = $bindable(),
  actionProps,
  hasDropzone = true,
  orientation = 'horizontal',
}: Props = $props()

// STATE :: SCROLL ARROWS
let showLeftArrow = $state(false)
let showRightArrow = $state(false)
let showTopArrow = $state(false)
let showBottomArrow = $state(false)

// DOM
let scrollContainer: HTMLElement
let galleryWrapper: HTMLElement

// Get images for rendering
let images = $derived(imageCtx.getImages())

// COMPUTED :: LAYOUT CLASSES
const isHorizontal = $derived(orientation === 'horizontal')
const containerClasses = $derived(
  isHorizontal
    ? 'flex w-full min-w-0 gap-4 overflow-x-auto scroll-smooth rounded-xl bg-glass-result p-4'
    : 'flex flex-col h-full min-h-0 gap-4 items-center overflow-y-auto scroll-smooth rounded-xl bg-glass-result p-4',
)

// HANDLERS :: SCROLL
const handleWheel = (event: WheelEvent) => {
  // Prevent default only when necessary
  if (!scrollContainer) return

  const { deltaY } = event

  if (isHorizontal) {
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainer
    // Calculate if we're at the edges
    const isAtLeftEdge = scrollLeft <= 0
    const isAtRightEdge = scrollLeft + clientWidth >= scrollWidth

    // Only prevent default if:
    // 1. Scrolling right and not at right edge
    // 2. Scrolling left and not at left edge
    if ((deltaY > 0 && !isAtRightEdge) || (deltaY < 0 && !isAtLeftEdge)) {
      event.preventDefault()

      // Smooth scroll horizontally
      scrollContainer.scrollBy({
        left: deltaY * 2,
        behavior: 'smooth',
      })
    }
  } else {
    // For vertical orientation, let natural scroll behavior work
    // but update arrows after scroll
    setTimeout(updateScrollArrows, 0)
  }
}

const handleScroll = () => {
  updateScrollArrows()
}

// UTILS :: SCROLL
const updateScrollArrows = () => {
  if (!scrollContainer) return

  if (isHorizontal) {
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainer

    // Show left arrow if we're not at the start
    showLeftArrow = scrollLeft > 20

    // Show right arrow if we're not at the end (with small buffer)
    showRightArrow =
      scrollWidth > clientWidth && scrollLeft + clientWidth < scrollWidth - 20

    // Reset vertical arrows
    showTopArrow = false
    showBottomArrow = false
  } else {
    const { scrollTop, scrollHeight, clientHeight } = scrollContainer

    // Show top arrow if we're not at the start
    showTopArrow = scrollTop > 20

    // Show bottom arrow if we're not at the end (with small buffer)
    showBottomArrow =
      scrollHeight > clientHeight && scrollTop + clientHeight < scrollHeight - 20

    // Reset horizontal arrows
    showLeftArrow = false
    showRightArrow = false
  }
}

const scrollTo = (direction: 'left' | 'right' | 'up' | 'down') => {
  if (!scrollContainer) return

  const scrollAmount = 600 // Width/height of 3 images

  if (isHorizontal && (direction === 'left' || direction === 'right')) {
    const currentScroll = scrollContainer.scrollLeft
    const targetScroll =
      direction === 'left' ? currentScroll - scrollAmount : currentScroll + scrollAmount

    scrollContainer.scrollTo({
      left: targetScroll,
      behavior: 'smooth',
    })
  } else if (!isHorizontal && (direction === 'up' || direction === 'down')) {
    const currentScroll = scrollContainer.scrollTop
    const targetScroll =
      direction === 'up' ? currentScroll - scrollAmount : currentScroll + scrollAmount

    scrollContainer.scrollTo({
      top: targetScroll,
      behavior: 'smooth',
    })
  }
}

// HANDLERS :: THUMBNAIL INTERACTION
const handleThumbnailHover = (imageId: string, event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()
  // Use target() method for proper communication with main viewer
  imageCtx.target(imageId)
}

const handleThumbnailClick = (imageId: string, event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()
  // Use target() method which sets lastChangeType to 'target' for proper PhotoFrame transitions
  imageCtx.target(imageId)
}

// EFFECT :: AUTO-SCROLL TO ACTIVE IMAGE
$effect(() => {
  if (imageCtx.activeImage) {
    const activeImageElement = document.getElementById(
      `thumbnail-${imageCtx.activeImage.id}`,
    )
    if (activeImageElement && scrollContainer) {
      // Get container and element positions
      const containerRect = scrollContainer.getBoundingClientRect()
      const elementRect = activeImageElement.getBoundingClientRect()

      if (isHorizontal) {
        // Calculate if element is outside visible area horizontally
        const isLeft = elementRect.left < containerRect.left
        const isRight = elementRect.right > containerRect.right

        if (isLeft || isRight) {
          const newScrollLeft = isLeft
            ? scrollContainer.scrollLeft + (elementRect.left - containerRect.left)
            : scrollContainer.scrollLeft + (elementRect.right - containerRect.right)

          scrollContainer.scrollTo({
            left: newScrollLeft,
            behavior: 'smooth',
          })
        }
      } else {
        // Calculate if element is outside visible area vertically
        const isAbove = elementRect.top < containerRect.top
        const isBelow = elementRect.bottom > containerRect.bottom

        if (isAbove || isBelow) {
          const newScrollTop = isAbove
            ? scrollContainer.scrollTop + (elementRect.top - containerRect.top)
            : scrollContainer.scrollTop + (elementRect.bottom - containerRect.bottom)

          scrollContainer.scrollTo({
            top: newScrollTop,
            behavior: 'smooth',
          })
        }
      }
    }
  }
})
</script>

<!-- Gallery wrapper with relative positioning for arrow placement -->
<div class="relative h-full w-full" bind:this={galleryWrapper}>
  <!-- Horizontal arrows -->
  {#if isHorizontal}
    {#if showLeftArrow}
      <ScrollArrow
        direction="left"
        onScroll={scrollTo}
        style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); z-index: 40;"
      />
    {/if}
    {#if showRightArrow}
      <ScrollArrow
        direction="right"
        onScroll={scrollTo}
        style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); z-index: 40;"
      />
    {/if}
  {:else}
    {#if showTopArrow}
      <ScrollArrow
        direction="up"
        onScroll={scrollTo}
        style="position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 40;"
      />
    {/if}
    {#if showBottomArrow}
      <ScrollArrow
        direction="down"
        onScroll={scrollTo}
        style="position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); z-index: 40;"
      />
    {/if}
  {/if}

  <!-- Main scroll container -->
  <div
    class={containerClasses}
    bind:this={scrollContainer}
    onwheel={handleWheel}
    onscroll={handleScroll}
  >
    <!-- Dropzone always first -->
    {#if hasDropzone}
      <div class="h-[200px] w-[200px] flex-none">
        <Dropzone {updateScrollArrows} bind:inputElement />
      </div>
    {/if}

    <!-- Upload queue with loading states and transitions -->
    {#each imageCtx.getUploadQueue() as fileObject (fileObject.file)}
      {#if !fileObject.imageToReplace && fileObject.status === 'uploading'}
        <!-- Show new uploads normally -->
        <div in:fade={{ duration: 200 }} class="relative h-[200px] w-[200px] flex-none">
          <UploadThumbnail {fileObject} />
        </div>
      {/if}
    {/each}

    <!-- Thumbnails with proper interaction handlers -->
    {#each imageCtx.getImages() as image, i (image.id)}
      <div
        id="thumbnail-{image.id}"
        animate:flip={{ duration: 300 }}
        in:fade={{ duration: 200, delay: i * 100 }}
        out:fade={{ duration: 200 }}
        class="relative h-[200px] w-[200px] flex-none cursor-pointer"
        onmouseenter={(e) => handleThumbnailHover(image.id, e)}
        onclick={(e) => handleThumbnailClick(image.id, e)}
      >
        {#if imageCtx.isImageBeingReplaced(image.id)}
          <!-- Show upload thumbnail for replacement -->
          <UploadThumbnail
            fileObject={imageCtx.getReplacementUpload(image.id) as ImageUpload}
          />
        {:else}
          <Thumbnail
            {image}
            idx={i}
            {actionProps}
            isHighlighted={imageCtx.isImageHighlighted(image.id)}
          />
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
/* Ensure smooth scrolling */
.scroll-smooth {
  scroll-behavior: smooth;
}
</style>
