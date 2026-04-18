<script lang="ts">
// BITS
import { Scrollbar } from '$lib/bits'
import { cx } from '$lib/bits/utils'
type ContainerProps = {
  children: import('svelte').Snippet
  viewport?: HTMLElement
  scrollable?: boolean | null
}

let { children, viewport = $bindable(), scrollable = null }: ContainerProps = $props()

let containerElement = $state<HTMLDivElement | undefined>()
let contents = $state<HTMLElement | undefined>()
const isScrollable = $derived(scrollable ?? false)
/**
 * Rebroadcasts scrollend from the internal viewport for portal recentering logic.
 */
function handleContainerScrollEnd(): void {
  const scrollEvent = new CustomEvent('containerscrollend', {
    bubbles: true,
    detail: {
      scrollTop: viewport?.scrollTop || 0,
      scrollHeight: viewport?.scrollHeight || 0,
      clientHeight: viewport?.clientHeight || 0,
    },
  })

  viewport?.dispatchEvent(scrollEvent)
}

$effect(() => {
  if (!viewport || !containerElement) return

  return () => {
    return
  }
})
</script>

<div
  bind:this={containerElement}
  class={cx(
    'pointer-events-none relative flex min-h-0 w-full flex-1 select-none flex-col overflow-hidden caret-transparent',
  )}
>
  <div
    bind:this={viewport}
    id="feature-card-viewport"
    class={cx(
      'pointer-events-none relative z-0 min-h-0 flex-1 overscroll-none',
      isScrollable ? 'overflow-y-auto overflow-x-auto' : 'overflow-hidden',
    )}
    onscrollend={handleContainerScrollEnd}
  >
    <!-- Pin the top corner caps to the viewport so scrolling content stays masked
         by the card chrome instead of dragging the caps with it. -->
    <div
      aria-hidden="true"
      class="pointer-events-none sticky inset-x-0 top-0 z-[60] shrink-0 overflow-visible"
      style="height: 16px; margin-bottom: -16px;"
    >
      <svg
        id="left-cap"
        aria-hidden="true"
        class="absolute left-0 top-0 block"
        style="z-index: 1; height: 16px; width: 16px;"
        viewBox="0 0 16 16"
        preserveAspectRatio="none"
      >
        <path d="M0 0H16A16 16 0 0 0 0 16Z" fill="black"></path>
      </svg>
      <svg
        id="right-cap"
        aria-hidden="true"
        class="absolute right-0 top-0 block"
        style="z-index: 1; height: 16px; width: 16px;"
        viewBox="0 0 16 16"
        preserveAspectRatio="none"
      >
        <path d="M16 0H0A16 16 0 0 1 16 16Z" fill="black"></path>
      </svg>
    </div>
    <div
      bind:this={contents}
      class="pointer-events-none flex min-h-full w-full flex-col items-stretch"
    >
      {@render children()}
    </div>
  </div>

  {#if isScrollable}
    <Scrollbar
      {viewport}
      {contents}
      alwaysVisible={false}
      margin={{ right: 0, top: 6, bottom: 4 }}
      width={{ track: 6, thumb: 4, thumbActive: 6 }}
      opacity={{ track: 0.3, thumb: 0.6, thumbActive: 0.8 }}
    />
  {/if}
</div>
