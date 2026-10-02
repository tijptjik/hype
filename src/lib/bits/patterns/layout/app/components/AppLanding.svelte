<script lang="ts">
// MAPS
import MapCanvas from '#lib/bits/patterns/maps/MapCanvas.svelte'
import type { MapController } from '#lib/map/controller.js'
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
  bindAppMap?: boolean
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
  bindAppMap,
  class: className = '',
  style = '',
}: AppLandingProps = $props()
</script>

<main
  class={cx('top-0 flex h-full w-dvw flex-1 flex-col gap-4 overflow-hidden', className)}
  {style}
>
  {@render children()}
  <MapCanvas
    {mapStyleCode}
    {pixelRatio}
    {antialias}
    {interactive}
    {showControls}
    {onMapReady}
    {bindAppMap}
  />
</main>
