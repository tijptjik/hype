<script lang="ts">
// SVELTE
import type { Snippet } from 'svelte'
// ICONS
import ChevronLeft from 'virtual:icons/lucide/chevron-left'
import ChevronRight from 'virtual:icons/lucide/chevron-right'

let { children }: { children: Snippet } = $props()
let root = $state<HTMLDivElement>()
let viewport = $state<HTMLDivElement>()
let content = $state<HTMLDivElement>()
let overflowing = $state(false)
let atStart = $state(true)
let atEnd = $state(true)

/** Measure the strip after scrolling, resizing or changing source languages.
 * @returns Nothing; updates navigation availability without polling.
 */
function measure(): void {
  if (!viewport || !root || !content) return
  overflowing = content.scrollWidth > root.clientWidth + 1
  atStart = viewport.scrollLeft <= 1
  atEnd = viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 1
}

$effect(() => {
  if (!viewport || !content || !root) return
  const observer = new ResizeObserver(measure)
  observer.observe(root)
  observer.observe(viewport)
  observer.observe(content)
  measure()
  return () => observer.disconnect()
})

/** Slide through one visible group, preserving a little overlap for orientation.
 * @param direction Previous or next group.
 * @returns Nothing; source selection remains unchanged.
 */
function slide(direction: -1 | 1): void {
  viewport?.scrollBy({
    left: direction * Math.max(24, viewport.clientWidth * 0.8),
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'instant'
      : 'smooth',
  })
}
</script>

<div
  bind:this={root}
  data-locale-source-strip
  class="flex max-w-full min-w-0 items-center"
  dir="ltr"
>
  {#if overflowing}
    <button
      type="button"
      aria-label="Previous languages"
      disabled={atStart}
      class="hover:bg-primary/10 focus-visible:outline-primary flex size-5 shrink-0 items-center justify-center rounded focus-visible:outline-2 disabled:opacity-30"
      onclick={() => slide(-1)}
    >
      <ChevronLeft class="size-3" />
    </button>
  {/if}
  <div
    bind:this={viewport}
    onscroll={measure}
    data-locale-source-viewport
    class="min-w-0 [scrollbar-width:none] overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden"
  >
    <div
      bind:this={content}
      class="flex w-max items-center whitespace-nowrap [&>button]:shrink-0"
    >
      {@render children()}
    </div>
  </div>
  {#if overflowing}
    <button
      type="button"
      aria-label="Next languages"
      disabled={atEnd}
      class="hover:bg-primary/10 focus-visible:outline-primary flex size-5 shrink-0 items-center justify-center rounded focus-visible:outline-2 disabled:opacity-30"
      onclick={() => slide(1)}
    >
      <ChevronRight class="size-3" />
    </button>
  {/if}
</div>
