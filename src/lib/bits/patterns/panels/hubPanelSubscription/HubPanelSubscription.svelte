<script lang="ts">
// THIRD PARTY
import Portal from 'svelte-portal'
// COMPONENTS
import * as HubPanelSubscriptionPrimitive from './components'
// TYPES
import type { HubPanelSubscriptionProps } from './hubPanelSubscription.types'

let props: HubPanelSubscriptionProps = $props()
let cardContainer: HTMLDivElement | undefined = $state()
let spacerHeight = $state(0)

// Keep the in-flow spacer aligned with the fixed footer height as copy wraps across breakpoints.
$effect(() => {
  if (!cardContainer || typeof ResizeObserver === 'undefined') {
    spacerHeight = cardContainer?.offsetHeight ?? 0
    return
  }

  const syncSpacerHeight = (): void => {
    spacerHeight = cardContainer?.offsetHeight ?? 0
  }

  syncSpacerHeight()

  const resizeObserver = new ResizeObserver(() => {
    syncSpacerHeight()
  })

  resizeObserver.observe(cardContainer)

  return () => {
    resizeObserver.disconnect()
  }
})
</script>

<div
  aria-hidden="true"
  class="shrink-0"
  style:height={spacerHeight ? `${spacerHeight}px` : undefined}
></div>

<Portal target="body">
  <div
    class="bits-theme pointer-events-none fixed inset-x-0 bottom-0 z-[60] md:right-auto md:w-[420px]"
  >
    <div
      bind:this={cardContainer}
      class="pointer-events-auto border-t border-base-content/10 bg-black/95 px-6 pb-[calc(env(safe-area-inset-bottom)+2rem)] shadow-[0_-18px_40px_rgba(0,0,0,0.45)] backdrop-blur supports-[backdrop-filter]:bg-black/80"
    >
      <HubPanelSubscriptionPrimitive.HubPanelSubscriptionCard {...props} />
    </div>
  </div>
</Portal>
