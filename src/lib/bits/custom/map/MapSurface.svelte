<script lang="ts">
import type { Snippet } from 'svelte'
import { MapLibre } from 'svelte-maplibre-gl'
import type { Map as MapLibreMap, MapOptions } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '#lib/styles/map.css'

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
