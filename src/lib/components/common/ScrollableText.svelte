<script lang="ts">
import { onMount, tick } from 'svelte'
import { checkScrollNeed, resetAnimation } from '$lib/client/services/text'

let {
  text,
  separator = '~',
  padding = 20,
  containerClass = '',
  textClass = '',
} = $props()

let container: HTMLDivElement | null = $state(null)
let contentSpan: HTMLSpanElement | null = $state(null)
let needsScroll = $state(false)

function performCheck() {
  if (container && contentSpan) {
    needsScroll = checkScrollNeed(container, contentSpan)
  }
}

// Effect for text changes
$effect(() => {
  text // depend on text
  async function update() {
    await tick()
    performCheck()
    resetAnimation(container) // Always reset on text change
  }
  update()
})

// Lifecycle for resize handling
onMount(() => {
  const handleResize = () => performCheck()
  window.addEventListener('resize', handleResize)
  return () => window.removeEventListener('resize', handleResize)
})
</script>

<div
  class="scroll-container relative w-full {containerClass}"
  class:overflow-hidden={needsScroll}
  bind:this={container}
  style="--scroll-padding: {padding}px; --scroll-padding-half: {padding / 2}px;"
>
  <div
    class="scroll-wrapper"
    class:animate={needsScroll}
    class:needs-scroll={needsScroll}
  >
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

.scroll-wrapper.animate {
  animation: scroll-single-title 13s linear infinite;
  animation-delay: 3s; /* 3 second pause at start */
}

.scroll-wrapper.animate:hover {
  animation-play-state: paused;
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

@keyframes scroll-single-title {
  0% {
    transform: translateX(0);
  }
  77% {
    transform: translateX(calc(-50% - var(--scroll-padding-half)));
  }
  100% {
    transform: translateX(calc(-50% - var(--scroll-padding-half)));
  }
}

.scroll-wrapper {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  transform-style: preserve-3d;
  -webkit-transform-style: preserve-3d;
}
</style>
