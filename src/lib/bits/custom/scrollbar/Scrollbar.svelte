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
