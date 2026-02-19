<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
import { untrack } from 'svelte'

// ═══════════════════════
// 1. PROPS
// ═══════════════════════

const {
  viewportHeight,
  contentsHeight,
  scrollTop,
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
}: {
  viewportHeight: number
  contentsHeight: number
  scrollTop: number
  hideAfter?: number
  alwaysVisible?: boolean
  initiallyVisible?: boolean
  showThumbOnTrackEnter?: boolean
  margin?: { top?: number; right?: number; bottom?: number; left?: number }
  width?: { track?: number; thumb?: number; thumbActive?: number }
  opacity?: { track?: number; thumb?: number; thumbActive?: number }
  vTrackIn?: (node: HTMLElement) => any
  vTrackOut?: (node: HTMLElement) => any
  vThumbIn?: (node: HTMLElement) => any
  vThumbOut?: (node: HTMLElement) => any
  onshow?: () => void
  onhide?: () => void
} = $props()

// ═══════════════════════
// 2. STATE
// ═══════════════════════

let vTrack: HTMLElement = $state(null!)
let vThumb: HTMLElement = $state(null!)
let visible = $state(false)
let interacted = $state(false)
let timer = $state(0)
let trackHoverTimer = $state(0)
let startTop = $state(0)
let startY = $state(0)
let trackHovered = $state(false)
let thumbHovered = $state(false)
let thumbDragging = $state(false)

// ═══════════════════════
// 3. DERIVED VALUES
// ═══════════════════════

const marginTop = $derived(margin.top ?? 0)
const marginBottom = $derived(margin.bottom ?? 0)
const marginRight = $derived(margin.right ?? 0)
const marginLeft = $derived(margin.left ?? 0)

const trackHeight = $derived(viewportHeight - (marginTop + marginBottom))
const thumbHeight = $derived(
  contentsHeight > 0 ? (trackHeight / contentsHeight) * trackHeight : 0,
)
const thumbTop = $derived(
  contentsHeight > 0 ? (scrollTop / contentsHeight) * trackHeight : 0,
)

const scrollable = $derived(contentsHeight > trackHeight)
const shouldBeVisible = $derived(
  scrollable &&
    (alwaysVisible || initiallyVisible || (showThumbOnTrackEnter && trackHovered)),
)

// ═══════════════════════
// 4. EFFECTS
// ═══════════════════════

// Handle visibility and scroll changes
$effect(() => {
  if (scrollTop !== undefined && scrollable) {
    untrack(() => {
      clearTimer()
      setupTimer()
      if (!visible) {
        visible = true
        onshow?.()
      }
      if (!interacted) {
        interacted = true
      }
    })
  } else if (!scrollable) {
    untrack(() => {
      visible = false
    })
  } else {
    // Initial state
    untrack(() => {
      visible = shouldBeVisible
    })
  }
})

// Track setup
$effect(() => {
  if (vTrack) {
    untrack(() => {
      const handleTrackEnter = () => {
        clearTimer()
        if (showThumbOnTrackEnter && !trackHovered) {
          // Clear any existing hover timer
          if (trackHoverTimer) {
            window.clearTimeout(trackHoverTimer)
            trackHoverTimer = 0
          }

          // Set 300ms delay before showing thumb
          trackHoverTimer = window.setTimeout(() => {
            trackHovered = true
            if (!visible) {
              visible = true
              onshow?.()
            }
            trackHoverTimer = 0
          }, 300)
        }
      }

      const handleTrackLeave = () => {
        // Cancel the hover timer if mouse leaves before delay
        if (trackHoverTimer) {
          window.clearTimeout(trackHoverTimer)
          trackHoverTimer = 0
        }

        if (showThumbOnTrackEnter && trackHovered) {
          trackHovered = false
        }
        clearTimer()
        setupTimer()
      }

      vTrack.addEventListener('mouseenter', handleTrackEnter)
      vTrack.addEventListener('mouseleave', handleTrackLeave)

      return () => {
        vTrack.removeEventListener('mouseenter', handleTrackEnter)
        vTrack.removeEventListener('mouseleave', handleTrackLeave)
        clearTrackHoverTimer()
      }
    })
  }
})

// Thumb setup
$effect(() => {
  if (vThumb) {
    untrack(() => {
      const handleThumbDown = (event: MouseEvent | TouchEvent) => {
        event.stopPropagation()
        event.preventDefault()

        thumbDragging = true
        startTop = scrollTop
        startY =
          'changedTouches' in event ? event.changedTouches[0].clientY : event.clientY

        document.addEventListener('mousemove', handleThumbMove)
        document.addEventListener('touchmove', handleThumbMove)
        document.addEventListener('mouseup', handleThumbUp)
        document.addEventListener('touchend', handleThumbUp)
      }

      const handleThumbMove = (event: MouseEvent | TouchEvent) => {
        event.stopPropagation()
        event.preventDefault()

        const clientY =
          'changedTouches' in event ? event.changedTouches[0].clientY : event.clientY
        const ratio = contentsHeight / trackHeight

        // Dispatch custom event with new scroll position
        const newScrollTop = startTop + ratio * (clientY - startY)
        window.dispatchEvent(
          new CustomEvent('virtualscroll', {
            detail: { scrollTop: newScrollTop },
          }),
        )
      }

      const handleThumbUp = (event: MouseEvent | TouchEvent) => {
        event.stopPropagation()
        event.preventDefault()

        thumbDragging = false
        startTop = 0
        startY = 0

        document.removeEventListener('mousemove', handleThumbMove)
        document.removeEventListener('touchmove', handleThumbMove)
        document.removeEventListener('mouseup', handleThumbUp)
        document.removeEventListener('touchend', handleThumbUp)
      }

      const handleThumbEnter = () => {
        thumbHovered = true
      }

      const handleThumbLeave = () => {
        thumbHovered = false
      }

      vThumb.addEventListener('mousedown', handleThumbDown, { passive: true })
      vThumb.addEventListener('touchstart', handleThumbDown, { passive: true })
      vThumb.addEventListener('mouseenter', handleThumbEnter)
      vThumb.addEventListener('mouseleave', handleThumbLeave)

      return () => {
        vThumb.removeEventListener('mousedown', handleThumbDown)
        vThumb.removeEventListener('touchstart', handleThumbDown)
        vThumb.removeEventListener('mouseenter', handleThumbEnter)
        vThumb.removeEventListener('mouseleave', handleThumbLeave)
      }
    })
  }
})

// ═══════════════════════
// 5. TIMERS
// ═══════════════════════

function setupTimer() {
  timer = window.setTimeout(() => {
    visible =
      (scrollable &&
        (alwaysVisible ||
          (initiallyVisible && !interacted) ||
          (showThumbOnTrackEnter && trackHovered))) ||
      false
    if (!visible) {
      onhide?.()
    }
  }, hideAfter)
}

function clearTimer() {
  if (timer) {
    window.clearTimeout(timer)
    timer = 0
  }
}

function clearTrackHoverTimer() {
  if (trackHoverTimer) {
    window.clearTimeout(trackHoverTimer)
    trackHoverTimer = 0
  }
}
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
      {#if visible}
        <div
          bind:this={vThumb}
          class="v-thumb"
          style:top="{thumbTop}px"
          style:width="{thumbHovered || thumbDragging
            ? width.thumbActive
            : width.thumb}px"
          style:height="{thumbHeight}px"
          style:opacity={thumbHovered ? opacity.thumbActive : opacity.thumb}
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
  border-radius: var(--svrollbar-thumb-radius, 0.25rem);
  background: var(--svrollbar-thumb-background, gray);
  box-shadow: var(--svrollbar-thumb-shadow, initial);
  pointer-events: auto;
  cursor: pointer;
  transition:
    width 0.3s ease-in-out,
    opacity 0.3s ease-in-out;
}
</style>
