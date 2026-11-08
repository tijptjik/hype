<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// MAPS
import MapLoading from '#lib/bits/patterns/maps/MapLoading.svelte'
import type { MapController } from '#lib/map/controller.js'
// I18N
import { m } from '#lib/i18n.js'
// BITS
import { cx } from '#lib/bits/utils.js'

type AppLandingProps = {
  children: import('svelte').Snippet
  mapStyleCode?: string
  pixelRatio?: number
  antialias?: boolean
  interactive?: boolean
  showControls?: boolean
  onMapReady?: (controller: MapController | null) => void
  class?: string
  style?: string
}

let {
  children,
  mapStyleCode = 'ghostery',
  pixelRatio,
  antialias,
  interactive,
  showControls,
  onMapReady,
  class: className = '',
  style = '',
}: AppLandingProps = $props()

type MapModule = typeof import('#lib/bits/patterns/maps/MapCanvas.svelte')
let renderer = $state<Promise<MapModule> | null>(null)
// Import the public map only when this landing surface is actually mounted.
onMount(() => {
  renderer = import('#lib/bits/patterns/maps/MapCanvas.svelte')
})
</script>

<main
  class={cx('top-0 flex h-full w-dvw flex-1 flex-col gap-4 overflow-hidden', className)}
  {style}
>
  {@render children()}
  {#if renderer}
    {#await renderer}
      <MapLoading />
    {:then module}
      <module.default
        {mapStyleCode}
        {pixelRatio}
        {antialias}
        {interactive}
        {showControls}
        {onMapReady}
      />
    {:catch}
      <button
        type="button"
        class="bg-base-200 relative z-10 rounded px-4 py-2"
        onclick={() => {
          renderer = import('#lib/bits/patterns/maps/MapCanvas.svelte')
        }}
      >
        {m.bootstrap__retry()}
      </button>
    {/await}
  {:else}
    <MapLoading />
  {/if}
</main>
