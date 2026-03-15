<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
import { untrack } from 'svelte'
// TYPES
import type { VirtualScrollbarProps } from '../scrollbar.types'

let {
  viewportHeight,
  contentsHeight,
  scrollTop,
  onVirtualScroll,
  onVirtualInteractionChange,
  hideAfter = 1000,
  alwaysVisible = false,
  initiallyVisible = false,
  showThumbOnTrackEnter = false,
  margin = {},
  width = {
    track: 10,
    thumb: 8,
    thumbActive: 12,
  },
  opacity = {
    track: 1,
    thumb: 0.5,
    thumbActive: 0.8,
  },
  vTrackIn = (node: HTMLElement) => fade(node, { duration: 100 }),
  vTrackOut = (node: HTMLElement) => fade(node, { duration: 300 }),
  vThumbIn = (node: HTMLElement) => fade(node, { duration: 100 }),
  vThumbOut = (node: HTMLElement) => fade(node, { duration: 300 }),
  onshow,
  onhide,
}: VirtualScrollbarProps = $props()

let vTrack = $state<HTMLElement | null>(null)
let vThumb = $state<HTMLElement | null>(null)
let visible = $state(false)
let interacted = $state(false)
let hideTimer = $state<number | null>(null)
let hoverTimer = $state<number | null>(null)
let dragStartScrollTop = $state(0)
let dragStartY = $state(0)
let trackHovered = $state(false)
let thumbHovered = $state(false)
let thumbDragging = $state(false)

const marginTop = $derived(margin.top ?? 0)
const marginBottom = $derived(margin.bottom ?? 0)
const marginRight = $derived(margin.right ?? 0)
const marginLeft = $derived(margin.left ?? 0)

const trackHeight = $derived(Math.max(0, viewportHeight - (marginTop + marginBottom)))
const maxScrollTop = $derived(Math.max(0, contentsHeight - viewportHeight))
const thumbHeight = $derived(
  contentsHeight > 0 ? Math.max(18, (trackHeight / contentsHeight) * trackHeight) : 0,
)
const thumbTop = $derived(
  maxScrollTop > 0 && trackHeight > thumbHeight
    ? (scrollTop / maxScrollTop) * (trackHeight - thumbHeight)
    : 0,
)

const scrollable = $derived(contentsHeight > viewportHeight)
const shouldBeVisible = $derived(
  scrollable &&
    (alwaysVisible ||
      (initiallyVisible && !interacted) ||
      (showThumbOnTrackEnter && trackHovered) ||
      thumbHovered ||
      thumbDragging),
)

function clearHideTimer(): void {
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer)
    hideTimer = null
  }
}

function clearHoverTimer(): void {
  if (hoverTimer !== null) {
    window.clearTimeout(hoverTimer)
    hoverTimer = null
  }
}

function showScrollbar(): void {
  clearHideTimer()

  if (!visible) {
    visible = true
    onshow?.()
  }
}

function clearAllTimers(): void {
  clearHideTimer()
  clearHoverTimer()
}

function releaseThumbDrag(): void {
  thumbDragging = false
  dragStartScrollTop = 0
  dragStartY = 0
  onVirtualInteractionChange?.(false)
}

function scheduleHide(): void {
  clearHideTimer()

  if (alwaysVisible) {
    visible = true
    return
  }

  hideTimer = window.setTimeout(() => {
    if (!shouldBeVisible) {
      visible = false
      onhide?.()
    }
  }, hideAfter)
}

$effect(() => {
  if (scrollTop !== undefined && scrollable) {
    untrack(() => {
      showScrollbar()
      scheduleHide()

      if (!interacted) {
        interacted = true
      }
    })
  } else if (!scrollable) {
    untrack(() => {
      clearHideTimer()
      visible = false
    })
  } else {
    untrack(() => {
      visible = shouldBeVisible
    })
  }
})

$effect(() => {
  if (!vTrack || !showThumbOnTrackEnter) {
    return
  }

  const handleTrackEnter = () => {
    clearHoverTimer()

    hoverTimer = window.setTimeout(() => {
      trackHovered = true
      showScrollbar()
      hoverTimer = null
    }, 300)
  }

  const handleTrackLeave = () => {
    clearHoverTimer()
    trackHovered = false
    scheduleHide()
  }

  vTrack.addEventListener('mouseenter', handleTrackEnter)
  vTrack.addEventListener('mouseleave', handleTrackLeave)

  return () => {
    vTrack?.removeEventListener('mouseenter', handleTrackEnter)
    vTrack?.removeEventListener('mouseleave', handleTrackLeave)
    clearHoverTimer()
  }
})

$effect(() => {
  if (!vThumb) {
    return
  }

  const handleThumbDown = (event: MouseEvent | TouchEvent) => {
    event.preventDefault()
    event.stopPropagation()

    thumbDragging = true
    interacted = true
    onVirtualInteractionChange?.(true)
    dragStartScrollTop = scrollTop
    dragStartY =
      'changedTouches' in event ? event.changedTouches[0].clientY : event.clientY

    showScrollbar()
    clearHideTimer()

    document.addEventListener('mousemove', handleThumbMove)
    document.addEventListener('touchmove', handleThumbMove, { passive: false })
    document.addEventListener('mouseup', handleThumbUp)
    document.addEventListener('touchend', handleThumbUp)
    document.addEventListener('touchcancel', handleThumbUp)
  }

  const handleThumbMove = (event: MouseEvent | TouchEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (trackHeight <= 0 || maxScrollTop <= 0) {
      return
    }

    const clientY =
      'changedTouches' in event ? event.changedTouches[0].clientY : event.clientY
    const deltaY = clientY - dragStartY
    const availableTrack = Math.max(1, trackHeight - thumbHeight)
    onVirtualScroll?.(dragStartScrollTop + (deltaY / availableTrack) * maxScrollTop)
  }

  const handleThumbUp = (event: MouseEvent | TouchEvent) => {
    event.preventDefault()
    event.stopPropagation()

    releaseThumbDrag()

    document.removeEventListener('mousemove', handleThumbMove)
    document.removeEventListener('touchmove', handleThumbMove)
    document.removeEventListener('mouseup', handleThumbUp)
    document.removeEventListener('touchend', handleThumbUp)
    document.removeEventListener('touchcancel', handleThumbUp)

    scheduleHide()
  }

  const handleThumbEnter = () => {
    thumbHovered = true
    showScrollbar()
  }

  const handleThumbLeave = () => {
    thumbHovered = false
    scheduleHide()
  }

  vThumb.addEventListener('mousedown', handleThumbDown)
  vThumb.addEventListener('touchstart', handleThumbDown, { passive: false })
  vThumb.addEventListener('mouseenter', handleThumbEnter)
  vThumb.addEventListener('mouseleave', handleThumbLeave)

  return () => {
    vThumb?.removeEventListener('mousedown', handleThumbDown)
    vThumb?.removeEventListener('touchstart', handleThumbDown)
    vThumb?.removeEventListener('mouseenter', handleThumbEnter)
    vThumb?.removeEventListener('mouseleave', handleThumbLeave)

    document.removeEventListener('mousemove', handleThumbMove)
    document.removeEventListener('touchmove', handleThumbMove)
    document.removeEventListener('mouseup', handleThumbUp)
    document.removeEventListener('touchend', handleThumbUp)
    document.removeEventListener('touchcancel', handleThumbUp)

    if (thumbDragging) {
      releaseThumbDrag()
    }
  }
})

$effect(() => {
  return () => {
    clearAllTimers()
  }
})
</script>

{#if visible || showThumbOnTrackEnter}
  <div
    class="v-scrollbar"
    style:width="{width.track}px"
    style:height="{trackHeight}px"
    style:margin-top="{marginTop}px"
    style:margin-right="{marginRight}px"
    style:margin-bottom="{marginBottom}px"
    style:margin-left="{marginLeft}px"
  >
    <div
      bind:this={vTrack}
      class="v-track"
      style:width="{width.track}px"
      style:height="{trackHeight}px"
      style:opacity={opacity.track}
      in:vTrackIn
      out:vTrackOut
    >
      {#if visible && scrollable}
        <div
          bind:this={vThumb}
          class="v-thumb"
          style:top="{thumbTop}px"
          style:width="{thumbHovered || thumbDragging ? width.thumbActive : width.thumb}px"
          style:height="{thumbHeight}px"
          style:opacity={thumbHovered || thumbDragging
            ? opacity.thumbActive
            : opacity.thumb}
          in:vThumbIn
          out:vThumbOut
        ></div>
      {/if}
    </div>
  </div>
{/if}

<style>
.v-scrollbar {
  position: absolute;
  top: 0;
  right: 0;
  pointer-events: none;
}

.v-track {
  position: absolute;
  top: 0;
  right: 0;
  border-radius: var(--svrollbar-track-radius, initial);
  background: var(--svrollbar-track-background, initial);
  box-shadow: var(--svrollbar-track-shadow, initial);
  pointer-events: auto;
}

.v-thumb {
  position: relative;
  margin: 0 auto;
  cursor: pointer;
  pointer-events: auto;
  border-radius: var(--svrollbar-thumb-radius, 0.25rem);
  background: var(--svrollbar-thumb-background, gray);
  box-shadow: var(--svrollbar-thumb-shadow, initial);
  transition:
    width 0.2s ease-in-out,
    opacity 0.2s ease-in-out;
}
</style>
