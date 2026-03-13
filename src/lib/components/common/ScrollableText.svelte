<script lang="ts">
import { onMount, tick } from 'svelte'
import { checkScrollNeed } from '$lib/client/services/text'

const CHARS_PER_SECOND = 12
const START_PAUSE_MS = 2500

let {
  text,
  separator = '•',
  padding = 20,
  containerClass = '',
  textClass = '',
} = $props()

let container: HTMLDivElement | null = $state(null)
let contentSpan: HTMLSpanElement | null = $state(null)
let wrapper: HTMLDivElement | null = $state(null)
let needsScroll = $state(false)
let scrollAnimation: Animation | null = $state(null)
let isMounted = false
let animationRunId = 0

function stopAnimation(): void {
  scrollAnimation?.cancel()
  scrollAnimation = null
  if (wrapper) {
    wrapper.style.transform = 'translateX(0)'
  }
}

function getVisibleCharacterCount(): number {
  const textContent = contentSpan?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  return Math.max(1, textContent.length)
}

function updateScrollState(): void {
  if (container && contentSpan) {
    needsScroll = checkScrollNeed(container, contentSpan)
  }
}

async function restartAnimation(): Promise<void> {
  const runId = ++animationRunId
  await tick()

  if (!isMounted || runId !== animationRunId) return

  updateScrollState()
  stopAnimation()

  if (!needsScroll || !contentSpan || !wrapper) return

  await tick()

  if (!isMounted || runId !== animationRunId || !contentSpan || !wrapper) return

  const distance = contentSpan.getBoundingClientRect().width + padding
  const motionDurationMs = (getVisibleCharacterCount() / CHARS_PER_SECOND) * 1000
  const totalDurationMs = motionDurationMs + START_PAUSE_MS
  const pauseOffset = START_PAUSE_MS / totalDurationMs

  scrollAnimation = wrapper.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(0)', offset: pauseOffset },
      { transform: `translateX(-${distance}px)` },
    ],
    {
      duration: totalDurationMs,
      easing: 'linear',
      iterations: Number.POSITIVE_INFINITY,
    },
  )
}

function handlePointerEnter(): void {
  scrollAnimation?.pause()
}

function handlePointerLeave(): void {
  scrollAnimation?.play()
}

// Effect for text changes
$effect(() => {
  text // depend on text
  void restartAnimation()
})

// Lifecycle for resize handling
onMount(() => {
  isMounted = true

  const handleResize = () => {
    void restartAnimation()
  }

  void restartAnimation()
  window.addEventListener('resize', handleResize)

  return () => {
    isMounted = false
    animationRunId += 1
    stopAnimation()
    window.removeEventListener('resize', handleResize)
  }
})
</script>

<div
  class="scroll-container relative w-full {containerClass}"
  class:overflow-hidden={needsScroll}
  bind:this={container}
  style="--scroll-padding: {padding}px; --scroll-padding-half: {padding / 2}px;"
  onmouseenter={handlePointerEnter}
  onmouseleave={handlePointerLeave}
>
  <div bind:this={wrapper} class="scroll-wrapper" class:needs-scroll={needsScroll}>
    <span class="scroll-primary {textClass}" bind:this={contentSpan}>
      {@html text}
    </span>
    {#if needsScroll}
      <span class="separator text-neutral-content" style="width: {padding}px;"
        >{separator}</span
      >
      <span class="scroll-secondary {textClass}"> {@html text} </span>
    {/if}
  </div>
</div>

<style>
/* Based on OmniNavHeader.svelte styles */
.scroll-container {
  position: relative;
  max-width: 100%;
  overflow: hidden;
}

.scroll-container.overflow-hidden {
  mask-image: linear-gradient(
    to right,
    black 0px,
    black calc(100% - 10px),
    transparent
  );
}

.scroll-wrapper {
  display: flex;
  white-space: nowrap;
  width: fit-content;
}

.scroll-primary {
  display: inline-block;
}

.separator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.scroll-secondary {
  display: inline-block;
}

.scroll-wrapper {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  transform-style: preserve-3d;
  -webkit-transform-style: preserve-3d;
}
</style>
