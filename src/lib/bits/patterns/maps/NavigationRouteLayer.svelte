<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
import { prefersReducedMotion } from 'svelte/motion'
// MAP
import { createNavigationRoute } from '#lib/map/navigationRoute.js'
import { getRouteBounds } from '#lib/routing/routeGeometry.js'
// TYPES
import type { Map as MapLibreMap, PaddingOptions } from 'maplibre-gl'
import type { LineString, MultiLineString, Point } from 'geojson'
import type { MapMarkerTheme } from '#lib/map/styles/catalog.js'

let {
  map,
  geometry,
  highlightedGeometry,
  theme,
  padding,
}: {
  map: MapLibreMap
  highlightedGeometry: LineString | Point | null
  geometry: MultiLineString
  theme: MapMarkerTheme
  padding: PaddingOptions
} = $props()
let renderer = $state.raw<ReturnType<typeof createNavigationRoute> | null>(null)

$effect(() => {
  const overlay = createNavigationRoute(map)
  renderer = overlay
  return () => overlay.destroy()
})

$effect(() => {
  const overlay = renderer
  const route = geometry
  const palette = theme
  untrack(() => overlay?.update(route, palette))
})

$effect(() => {
  const overlay = renderer
  const selected = highlightedGeometry
  untrack(() => overlay?.highlight(selected))
})

// Refit route/panel/viewport changes, without recentering after ordinary user pans.
$effect(() => {
  const bounds = getRouteBounds(geometry)
  const inset = padding
  const target = map
  /**
   * Fits the route after the native renderer has its actual dimensions.
   * @param duration - Camera transition time in milliseconds.
   * @returns Nothing.
   */
  const fitRoute = (duration: number): void => {
    untrack(() =>
      target.fitBounds(bounds, {
        padding: inset,
        bearing: 0,
        pitch: 0,
        maxZoom: 17,
        duration: prefersReducedMotion.current ? 0 : duration,
      }),
    )
  }
  const resized = (): void => fitRoute(0)
  // Responsive state can flush before MapLibre's resize event; measure before fitting.
  untrack(() => target.resize())
  fitRoute(500)
  target.on('resize', resized)
  return () => target.off('resize', resized)
})
</script>
