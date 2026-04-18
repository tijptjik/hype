<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
import { onDestroy, onMount } from 'svelte'
// TYPES
import type { TransitionConfig } from 'svelte/transition'
import type {
  ScrollbarMargin,
  ScrollbarOpacity,
  ScrollbarWidth,
} from '../scrollbar.types'

type SvrollbarProps = {
  viewport?: HTMLElement | null
  contents?: HTMLElement | null
  hideAfter?: number
  alwaysVisible?: boolean
  initiallyVisible?: boolean
  showThumbOnTrackEnter?: boolean
  margin?: ScrollbarMargin
  width?: ScrollbarWidth
  opacity?: ScrollbarOpacity
  vTrackIn?: (node: HTMLElement) => TransitionConfig
  vTrackOut?: (node: HTMLElement) => TransitionConfig
  vThumbIn?: (node: HTMLElement) => TransitionConfig
  vThumbOut?: (node: HTMLElement) => TransitionConfig
  onshow?: () => void
  onhide?: () => void
  debug?: boolean
}

let {
  viewport = $bindable<HTMLElement | null>(null),
  contents = $bindable<HTMLElement | null>(null),
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
  debug = false,
}: SvrollbarProps = $props()

let vTrack = $state<HTMLDivElement>()
let vThumb = $state<HTMLDivElement>()
let startTop = $state(0)
let startY = $state(0)
let timer = $state(0)
let trackHoverTimer = $state(0)
let windowScrollEnabled = $state(false)
let interacted = $state(false)
let trackHovered = $state(false)
let thumbHovered = $state(false)
let thumbDragging = $state(false)

let wholeHeight = $state(0)
let scrollTop = $state(0)
let trackHeight = $state(0)
let thumbHeight = $state(0)
let thumbTop = $state(0)

let teardownViewport = $state<(() => void) | undefined>()
let teardownContents = $state<(() => void) | undefined>()
let teardownTrack = $state<(() => void) | undefined>()
let teardownThumb = $state<(() => void) | undefined>()

let isScrollable = $state(false)
let isVisible = $state(false)
let actualScrollElement = $state<HTMLElement | undefined>()

const marginTop = $derived(margin.top ?? 0)
const marginBottom = $derived(margin.bottom ?? 0)
const marginRight = $derived(margin.right ?? 0)
const marginLeft = $derived(margin.left ?? 0)

function updateMeasurements(): void {
  if (!viewport || !actualScrollElement) return

  const newWholeHeight = actualScrollElement.scrollHeight
  const newScrollTop = actualScrollElement.scrollTop
  const newTrackHeight = viewport.clientHeight - (marginTop + marginBottom)
  const newThumbHeight =
    newWholeHeight > 0 ? (newTrackHeight / newWholeHeight) * newTrackHeight : 0
  const newThumbTop =
    newWholeHeight > 0 ? (newScrollTop / newWholeHeight) * newTrackHeight : 0
  const newScrollable = newWholeHeight > newTrackHeight
  const newVisible =
    newScrollable &&
    (alwaysVisible ||
      initiallyVisible ||
      (showThumbOnTrackEnter && trackHovered) ||
      interacted)

  if (wholeHeight !== newWholeHeight) wholeHeight = newWholeHeight
  if (scrollTop !== newScrollTop) scrollTop = newScrollTop
  if (trackHeight !== newTrackHeight) trackHeight = newTrackHeight
  if (thumbHeight !== newThumbHeight) thumbHeight = newThumbHeight
  if (thumbTop !== newThumbTop) thumbTop = newThumbTop
  if (isScrollable !== newScrollable) isScrollable = newScrollable
  if (isVisible !== newVisible) isVisible = newVisible

  if (debug) {
    console.log('Measurements updated:', {
      wholeHeight,
      scrollTop,
      trackHeight,
      thumbHeight,
      thumbTop,
      isScrollable,
      isVisible,
      viewportClientHeight: viewport.clientHeight,
      actualScrollHeight: actualScrollElement.scrollHeight,
      actualScrollTop: actualScrollElement.scrollTop,
    })
  }
}

function setupAll(): void {
  if (viewport) {
    teardownViewport?.()
    teardownViewport = setupViewport(viewport)
  }

  if (contents) {
    teardownContents?.()
    teardownContents = setupContents(contents)
  }

  if (vTrack) {
    teardownTrack?.()
    teardownTrack = setupTrack(vTrack)
  }

  if (vThumb) {
    teardownThumb?.()
    teardownThumb = setupThumb(vThumb)
  }
}

function setupViewport(viewportElement: HTMLElement): (() => void) | undefined {
  if (typeof window.ResizeObserver === 'undefined') {
    throw new Error('window.ResizeObserver is missing.')
  }

  windowScrollEnabled = document.scrollingElement === viewportElement

  let scrollableElement: HTMLElement = viewportElement
  const computedStyle = getComputedStyle(viewportElement)

  if (computedStyle.overflowY === 'hidden' || computedStyle.overflow === 'hidden') {
    if (
      contents &&
      contents !== viewportElement &&
      contents.scrollHeight > contents.clientHeight
    ) {
      scrollableElement = contents
    }

    if (scrollableElement === viewportElement) {
      const children = viewportElement.children

      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (!(child instanceof HTMLElement)) continue

        if (child.scrollHeight > child.clientHeight) {
          scrollableElement = child
          break
        }
      }
    }
  }

  if (scrollableElement !== viewportElement) {
    scrollableElement.addEventListener('scroll', onScroll, { passive: true })
  } else {
    viewportElement.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('scroll', onScroll, { passive: true })

    if (contents && contents !== viewportElement) {
      contents.addEventListener('scroll', onScroll, { passive: true })
    }
  }

  const observer = new ResizeObserver(() => {
    updateMeasurements()
  })

  observer.observe(viewportElement)
  actualScrollElement = scrollableElement
  updateMeasurements()

  return () => {
    if (scrollableElement !== viewportElement) {
      scrollableElement.removeEventListener('scroll', onScroll)
    } else {
      viewportElement.removeEventListener('scroll', onScroll)
      document.removeEventListener('scroll', onScroll)

      if (contents && contents !== viewportElement) {
        contents.removeEventListener('scroll', onScroll)
      }
    }

    observer.unobserve(viewportElement)
    observer.disconnect()
  }
}

function setupTrack(track: HTMLDivElement): (() => void) | undefined {
  const handleTrackEnter = () => {
    clearTimer()

    if (showThumbOnTrackEnter && !trackHovered) {
      if (trackHoverTimer) {
        window.clearTimeout(trackHoverTimer)
        trackHoverTimer = 0
      }

      trackHoverTimer = window.setTimeout(() => {
        trackHovered = true
        updateMeasurements()
        if (isVisible) {
          onshow?.()
        }
        trackHoverTimer = 0
      }, 300)
    } else if (!showThumbOnTrackEnter) {
      trackHovered = true
    }
  }

  const handleTrackLeave = () => {
    if (trackHoverTimer) {
      window.clearTimeout(trackHoverTimer)
      trackHoverTimer = 0
    }

    trackHovered = false
    if (showThumbOnTrackEnter) {
      updateMeasurements()
    }

    clearTimer()
    setupTimer()
  }

  track.addEventListener('mouseenter', handleTrackEnter)
  track.addEventListener('mouseleave', handleTrackLeave)

  return () => {
    track.removeEventListener('mouseenter', handleTrackEnter)
    track.removeEventListener('mouseleave', handleTrackLeave)
    clearTrackHoverTimer()
  }
}

function setupThumb(thumb: HTMLDivElement): (() => void) | undefined {
  const handleThumbEnter = () => {
    thumbHovered = true
  }

  const handleThumbLeave = () => {
    thumbHovered = false
  }

  thumb.addEventListener('mousedown', onThumbDown, { passive: true })
  thumb.addEventListener('touchstart', onThumbDown, { passive: true })
  thumb.addEventListener('mouseenter', handleThumbEnter)
  thumb.addEventListener('mouseleave', handleThumbLeave)

  return () => {
    thumb.removeEventListener('mousedown', onThumbDown)
    thumb.removeEventListener('touchstart', onThumbDown)
    thumb.removeEventListener('mouseenter', handleThumbEnter)
    thumb.removeEventListener('mouseleave', handleThumbLeave)
  }
}

function setupContents(contentsElement: HTMLElement): (() => void) | undefined {
  if (typeof window.ResizeObserver === 'undefined') {
    throw new Error('window.ResizeObserver is missing.')
  }

  const observer = new ResizeObserver(() => {
    updateMeasurements()
  })

  observer.observe(contentsElement)

  return () => {
    observer.unobserve(contentsElement)
    observer.disconnect()
  }
}

function setupTimer(): void {
  timer = window.setTimeout(() => {
    interacted = false
    updateMeasurements()
    onhide?.()
  }, hideAfter)
}

function clearTimer(): void {
  if (timer) {
    window.clearTimeout(timer)
    timer = 0
  }
}

function clearTrackHoverTimer(): void {
  if (trackHoverTimer) {
    window.clearTimeout(trackHoverTimer)
    trackHoverTimer = 0
  }
}

function onScroll(): void {
  if (!viewport) return

  clearTimer()
  setupTimer()
  updateMeasurements()
  interacted = true
  onshow?.()
}

function onThumbDown(event: MouseEvent | TouchEvent): void {
  event.stopPropagation()
  event.preventDefault()

  thumbDragging = true
  startTop = actualScrollElement?.scrollTop ?? 0
  startY = 'changedTouches' in event ? event.changedTouches[0].clientY : event.clientY

  document.addEventListener('mousemove', onThumbMove)
  document.addEventListener('touchmove', onThumbMove)
  document.addEventListener('mouseup', onThumbUp)
  document.addEventListener('touchend', onThumbUp)
}

function onThumbMove(event: MouseEvent | TouchEvent): void {
  event.stopPropagation()
  event.preventDefault()

  const clientY =
    'changedTouches' in event ? event.changedTouches[0].clientY : event.clientY
  const ratio = wholeHeight / trackHeight

  if (actualScrollElement) {
    actualScrollElement.scrollTop = startTop + ratio * (clientY - startY)
  }
}

function onThumbUp(event: MouseEvent | TouchEvent): void {
  event.stopPropagation()
  event.preventDefault()

  thumbDragging = false
  startTop = 0
  startY = 0

  document.removeEventListener('mousemove', onThumbMove)
  document.removeEventListener('touchmove', onThumbMove)
  document.removeEventListener('mouseup', onThumbUp)
  document.removeEventListener('touchend', onThumbUp)
}

onMount(() => {
  setupAll()

  let lastViewport = viewport
  let lastContents = contents
  let lastVTrack = vTrack
  let lastVThumb = vThumb

  const checkInterval = setInterval(() => {
    if (
      viewport !== lastViewport ||
      contents !== lastContents ||
      vTrack !== lastVTrack ||
      vThumb !== lastVThumb
    ) {
      setupAll()
      lastViewport = viewport
      lastContents = contents
      lastVTrack = vTrack
      lastVThumb = vThumb
    }
  }, 100)

  return () => {
    clearInterval(checkInterval)
  }
})

onDestroy(() => {
  teardownViewport?.()
  teardownContents?.()
  teardownTrack?.()
  teardownThumb?.()
})
</script>

{#if isVisible || showThumbOnTrackEnter}
  <div
    class="v-scrollbar"
    class:fixed={windowScrollEnabled}
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
    ></div>
    {#if isVisible}
      <div
        bind:this={vThumb}
        class="v-thumb"
        style:top="{thumbTop}px"
        style:width="{thumbHovered || thumbDragging
          ? width.thumbActive
          : width.thumb}px"
        style:height="{thumbHeight}px"
        style:opacity={thumbHovered || thumbDragging
          ? opacity.thumbActive
          : opacity.thumb}
        in:vThumbIn
        out:vThumbOut
      ></div>
    {/if}
  </div>
{/if}

<style>
.v-scrollbar {
  position: absolute;
  top: 0;
  right: 0;
  pointer-events: none;
}

.v-scrollbar.fixed {
  position: fixed;
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
