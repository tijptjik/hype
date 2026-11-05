<script lang="ts">
// BROWSER
import { BROWSER } from 'esm-env'
// TYPES
import type { ScrollbarProps } from './scrollbar.types'
// BITS
import { Svrollbar } from './components'
import { VirtualScrollbar } from './src'

let {
  viewport,
  contents,
  virtual = false,
  viewportHeight = 0,
  contentsHeight = 0,
  scrollTop = 0,
  onVirtualScroll,
  onVirtualInteractionChange,
  showThumbOnTrackEnter = false,
  width = {
    track: 10,
    thumb: 8,
    thumbActive: 12,
  },
  ...restProps
}: ScrollbarProps = $props()

let scrollbarElement = $state<HTMLElement | null>(null)
let isScrolling = $state(false)
let scrollTimeout = $state<ReturnType<typeof setTimeout> | null>(null)

function clearScrollTimeout(): void {
  if (scrollTimeout) {
    clearTimeout(scrollTimeout)
    scrollTimeout = null
  }
}

function addScrollingClass(): void {
  if (!BROWSER || isScrolling) {
    return
  }

  isScrolling = true
  document.body.classList.add('svrollbar-scrolling')

  clearScrollTimeout()
}

function scheduleRemoveScrollingClass(): void {
  if (!BROWSER) {
    return
  }

  clearScrollTimeout()

  scrollTimeout = setTimeout(() => {
    isScrolling = false
    document.body.classList.remove('svrollbar-scrolling')
  }, 150)
}

// The virtual scrollbar overlays the viewport as a sibling, so wheel input over
// its track or thumb needs forwarding to the same native scrolling element.
$effect(() => {
  if (!virtual || !scrollbarElement || !viewport) return
  const element = scrollbarElement
  const scrollViewport = viewport

  /**
   * Scrolls the list when wheel input lands on its overlaid scrollbar.
   * @param event Wheel input from the track or thumb.
   * @returns Nothing; preserves zoom gestures and outer scrolling at list edges.
   */
  function handleWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey || event.shiftKey || !event.deltaY) return
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return

    const unit =
      event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? scrollViewport.clientHeight
        : event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? Number.parseFloat(getComputedStyle(scrollViewport).lineHeight) || 16
          : 1
    const previousTop = scrollViewport.scrollTop
    scrollViewport.scrollTop += event.deltaY * unit
    if (scrollViewport.scrollTop !== previousTop) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  element.addEventListener('wheel', handleWheel, { passive: false })
  return () => element.removeEventListener('wheel', handleWheel)
})

$effect(() => {
  if (!BROWSER || !scrollbarElement) {
    return
  }

  const element = scrollbarElement

  const handleMouseDown = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null

    if (target?.closest('[data-svrollbar]')) {
      addScrollingClass()
    }
  }

  const handleMouseUp = () => {
    if (isScrolling) {
      scheduleRemoveScrollingClass()
    }
  }

  const handleMouseLeave = () => {
    if (isScrolling) {
      scheduleRemoveScrollingClass()
    }
  }

  const handleDragStart = (event: DragEvent) => {
    const target = event.target as HTMLElement | null

    if (target?.closest('[data-svrollbar]')) {
      event.preventDefault()
      event.stopPropagation()
      addScrollingClass()
    }
  }

  const handleScroll = () => {
    addScrollingClass()
    scheduleRemoveScrollingClass()
  }

  element.addEventListener('mousedown', handleMouseDown, true)
  document.addEventListener('mouseup', handleMouseUp)
  document.addEventListener('mouseleave', handleMouseLeave)
  document.addEventListener('dragstart', handleDragStart, true)
  viewport?.addEventListener('scroll', handleScroll, { passive: true })

  return () => {
    element.removeEventListener('mousedown', handleMouseDown, true)
    document.removeEventListener('mouseup', handleMouseUp)
    document.removeEventListener('mouseleave', handleMouseLeave)
    document.removeEventListener('dragstart', handleDragStart, true)
    viewport?.removeEventListener('scroll', handleScroll)

    clearScrollTimeout()
    document.body.classList.remove('svrollbar-scrolling')
  }
})
</script>

<div bind:this={scrollbarElement} data-svrollbar="true" class="svrollbar-wrapper">
  {#if virtual}
    <VirtualScrollbar
      {viewportHeight}
      {contentsHeight}
      {scrollTop}
      {onVirtualScroll}
      {onVirtualInteractionChange}
      {showThumbOnTrackEnter}
      {width}
      {...restProps}
    />
  {:else}
    <Svrollbar {viewport} {contents} {showThumbOnTrackEnter} {width} {...restProps} />
  {/if}
</div>

<style>
.svrollbar-wrapper {
  position: absolute;
  inset: 0;
  z-index: 50;
  pointer-events: none;
}
</style>
