<script lang="ts">
import { onMount } from 'svelte'

type ScrollableTextProps = {
  text: string
  separator?: string
  padding?: number
  class?: string
  containerClass?: string
  textClass?: string
}

let {
  text,
  separator = '•',
  padding = 24,
  class: className = '',
  containerClass = '',
  textClass = '',
}: ScrollableTextProps = $props()

let containerElement = $state<HTMLSpanElement | null>(null)
let primaryContentElement = $state<HTMLSpanElement | null>(null)
let separatorElement = $state<HTMLSpanElement | null>(null)
let hasOverflow = $state(false)
let contentWidth = $state(0)
let separatorWidth = $state(0)
let currentOffset = $state(0)
let isAutoScrolling = false
let isPointerHovering = false
let isDragging = false
let pointerId = $state<number | null>(null)
let dragStartX = 0
let dragStartOffset = 0
let scrollAnimationFrame: number | null = null
let scrollDelayTimeout: ReturnType<typeof setTimeout> | null = null

const content = $derived(text || separator)
const loopSeparator = $derived(separator)
const loopGap = $derived(Math.max(16, padding))
const loopDistance = $derived(contentWidth + separatorWidth + loopGap * 2)
const trackStyle = $derived(`transform: translate3d(${-currentOffset}px, 0, 0);`)
const rootStyle = $derived(
  `--bits-scrollable-text-padding: ${padding}px; --bits-scrollable-text-gap: ${loopGap}px;`,
)
const hasLeadingFade = $derived(hasOverflow && currentOffset > 1)
const hasTrailingFade = $derived(hasOverflow)

const AUTO_SCROLL_DELAY_MS = 2500
const AUTO_SCROLL_STEP_PX = 1.125

function normalizeOffset(nextOffset: number): number {
  if (loopDistance <= 0) return 0

  let normalizedOffset = nextOffset % loopDistance
  if (normalizedOffset < 0) normalizedOffset += loopDistance
  return normalizedOffset
}

function clearScrollDelay(): void {
  if (scrollDelayTimeout === null) return
  clearTimeout(scrollDelayTimeout)
  scrollDelayTimeout = null
}

function stopAutoScroll(): void {
  clearScrollDelay()

  if (scrollAnimationFrame !== null) {
    cancelAnimationFrame(scrollAnimationFrame)
    scrollAnimationFrame = null
  }

  isAutoScrolling = false
}

function scheduleAutoScroll(delayMs = AUTO_SCROLL_DELAY_MS): void {
  if (!hasOverflow || isPointerHovering || isDragging || isAutoScrolling) return

  clearScrollDelay()
  scrollDelayTimeout = setTimeout(() => {
    scrollDelayTimeout = null

    if (!hasOverflow || isPointerHovering || isDragging) return

    isAutoScrolling = true
    scrollAnimationFrame = requestAnimationFrame(stepAutoScroll)
  }, delayMs)
}

function stepAutoScroll(): void {
  if (!hasOverflow || isPointerHovering || isDragging || loopDistance <= 0) {
    stopAutoScroll()
    return
  }

  const nextOffset = currentOffset + AUTO_SCROLL_STEP_PX

  if (nextOffset >= loopDistance) {
    currentOffset = normalizeOffset(nextOffset)
    stopAutoScroll()
    scheduleAutoScroll(AUTO_SCROLL_DELAY_MS)
    return
  }

  currentOffset = nextOffset

  scrollAnimationFrame = requestAnimationFrame(stepAutoScroll)
}

function measureOverflow(): void {
  const container = containerElement
  const primaryContent = primaryContentElement
  const separator = separatorElement

  if (!container || !primaryContent) {
    hasOverflow = false
    contentWidth = 0
    separatorWidth = 0
    currentOffset = 0
    return
  }

  contentWidth = primaryContent.scrollWidth
  separatorWidth = separator?.scrollWidth ?? 0
  hasOverflow = contentWidth > container.clientWidth

  if (!hasOverflow) {
    currentOffset = 0
  } else {
    currentOffset = normalizeOffset(currentOffset)
  }
}

function handlePointerEnter(): void {
  if (!hasOverflow) return
  isPointerHovering = true
  stopAutoScroll()
}

function handlePointerLeave(): void {
  isPointerHovering = false

  if (!isDragging) {
    scheduleAutoScroll(AUTO_SCROLL_DELAY_MS)
  }
}

function handlePointerDown(event: PointerEvent): void {
  if (!hasOverflow || !containerElement) return

  isPointerHovering = true
  isDragging = true
  pointerId = event.pointerId
  dragStartX = event.clientX
  dragStartOffset = currentOffset
  stopAutoScroll()
  containerElement.setPointerCapture(event.pointerId)
}

function handlePointerMove(event: PointerEvent): void {
  if (!isDragging || pointerId !== event.pointerId) return

  const deltaX = event.clientX - dragStartX
  currentOffset = normalizeOffset(dragStartOffset - deltaX)
}

function finishDrag(event: PointerEvent): void {
  if (!isDragging || pointerId !== event.pointerId) return

  if (containerElement?.hasPointerCapture(event.pointerId)) {
    containerElement.releasePointerCapture(event.pointerId)
  }

  isDragging = false
  pointerId = null
  dragStartX = 0
  dragStartOffset = currentOffset

  if (!isPointerHovering) {
    scheduleAutoScroll(AUTO_SCROLL_DELAY_MS)
  }
}

$effect(() => {
  content
  padding
  queueMicrotask(measureOverflow)
})

$effect(() => {
  hasOverflow
  contentWidth

  stopAutoScroll()

  if (!hasOverflow) return

  scheduleAutoScroll(AUTO_SCROLL_DELAY_MS)

  return () => {
    stopAutoScroll()
  }
})

onMount(() => {
  measureOverflow()

  const container = containerElement
  const primaryContent = primaryContentElement
  const separator = separatorElement

  if (!container || !primaryContent) return

  const observer = new ResizeObserver(() => {
    measureOverflow()
  })

  observer.observe(container)
  observer.observe(primaryContent)
  if (separator) observer.observe(separator)

  return () => {
    stopAutoScroll()
    observer.disconnect()
  }
})
</script>

<span
  bind:this={containerElement}
  class={`bits-scrollable-text ${className} ${containerClass}`.trim()}
  data-overflow={hasOverflow}
  data-dragging={isDragging}
  data-leading-fade={hasLeadingFade}
  data-trailing-fade={hasTrailingFade}
  style={rootStyle}
  title={text}
  onpointerenter={handlePointerEnter}
  onpointerleave={handlePointerLeave}
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={finishDrag}
  onpointercancel={finishDrag}
>
  <span class="bits-scrollable-text__viewport">
    {#if hasOverflow}
      <span class="bits-scrollable-text__track" style={trackStyle}>
        <span
          bind:this={primaryContentElement}
          class={`bits-scrollable-text__content ${textClass}`.trim()}
          >{content}</span
        >
        <span
          bind:this={separatorElement}
          class="bits-scrollable-text__separator"
          aria-hidden="true"
        >
          {loopSeparator}
        </span>
        <span
          class={`bits-scrollable-text__content bits-scrollable-text__content--clone ${textClass}`.trim()}
          aria-hidden="true"
          >{content}</span
        >
      </span>
    {:else}
      <span
        bind:this={primaryContentElement}
        class={`bits-scrollable-text__content ${textClass}`.trim()}
        >{content}</span
      >
    {/if}
  </span>
</span>
