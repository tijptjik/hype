<script lang="ts">
// SVELTE
import { fly } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
// ICONS
import CloseIcon from 'virtual:icons/proicons/cancel-circle'
// CONTEXT
import { getAppCtx } from '#lib/context/app.svelte.js'
// COMPONENTS
import StationRouteControls from './StationRouteControls.svelte'

let { open = $bindable(false), offsetX = 0 }: { open?: boolean; offsetX?: number } =
  $props()
const app = getAppCtx()
</script>

<svelte:window
  onkeydown={event => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      open = false
    }
  }}
/>
{#if open && app.view.isSuperAdmin() && app.station.active}
  <section
    aria-label="Route preview"
    class="text-base-content fixed bottom-24 left-1/2 z-100 max-h-[65vh] w-max max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl bg-[var(--station-canvas)] p-4 shadow-sm"
    style:transform={`translateX(calc(-50% + ${offsetX}px))`}
    transition:fly={{ y: 12, duration: prefersReducedMotion.current ? 0 : 160 }}
  >
    <div class="mb-3 flex items-center justify-between gap-4">
      <h2 class="text-primary text-sm font-medium">Route preview</h2>
      <button
        type="button"
        aria-label="Close route preview"
        class="rounded p-1"
        onclick={() => (open = false)}
      >
        <CloseIcon class="size-5" />
      </button>
    </div>
    <StationRouteControls />
  </section>
{/if}
