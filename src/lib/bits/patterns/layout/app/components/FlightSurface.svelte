<script lang="ts">
// SVELTE
import type { Snippet } from 'svelte'
// MAP
import type { MapController } from '#lib/map/controller.js'
// COMPONENTS
import AppLanding from './AppLanding.svelte'

let {
  children,
  class: className = '',
  flightTimeMs = 120000,
}: {
  children?: Snippet
  class?: string
  flightTimeMs?: number
} = $props()

let flightController = $state<MapController | null>(null)
const handleMapReady = (controller: MapController | null): void => {
  flightController = controller
}

$effect(() => {
  if (!flightController) return
  return flightController.startOrbit({
    center: [114.17276, 22.29191],
    radiusKm: 5,
    durationMs: flightTimeMs,
  })
})
</script>

<AppLanding
  class={`relative items-center justify-center bg-black/20 ${className}`}
  pixelRatio={1}
  antialias={false}
  interactive={false}
  showControls={false}
  bindAppMap={false}
  onMapReady={handleMapReady}
>
  {#if children}
    {@render children()}
  {/if}
</AppLanding>
