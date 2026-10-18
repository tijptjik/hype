<script lang="ts">
import type { Snippet } from 'svelte'
import { MapLibre } from 'svelte-maplibre-gl'
import type { Map as MapLibreMap, MapOptions } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '#lib/styles/map.css'

// MAP
import { installStreetLabelPlacement } from '#lib/map/street-label-placement'

type MapSurfaceProps = Omit<MapOptions, 'container' | 'style'> & {
  style: MapOptions['style']
  map?: MapLibreMap
  class?: string
  inlineStyle?: string
  children?: Snippet<[MapLibreMap]>
  [key: `on${string}`]: unknown
}

let {
  map = $bindable(undefined),
  style,
  class: className = '',
  inlineStyle,
  children,
  ...options
}: MapSurfaceProps = $props()
// Keep alternate street labels synchronized with the active map and camera.
$effect(() => {
  if (!map) return
  return installStreetLabelPlacement(map)
})
</script>

<MapLibre
  bind:map
  {style}
  class={className}
  {inlineStyle}
  autoloadGlobalCss={false}
  {...options as Omit<MapOptions, 'container' | 'style'>}
>
  {#if map}
    {@render children?.(map)}
  {/if}
</MapLibre>
