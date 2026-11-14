<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
import { installBrandLocationCanvas } from '#lib/locations/brandLocationCanvas.js'
// COMPONENTS
import Button from '#lib/bits/core/button/Button.svelte'
import RetryIcon from 'virtual:icons/lucide/rotate-cw'
// MAP
import 'svelte-maplibre-gl/vite'
import { NavigationControl, AttributionControl } from 'svelte-maplibre-gl'
import MapSurface from '#lib/bits/custom/map/MapSurface.svelte'
import {
  applyRuntimeBasemapSource,
  buildCatalogMapStyle,
  getConfiguredBasemapAccessToken,
  getDefaultMapStyleKey,
  isMapStyleKey,
} from '#lib/map/styles/index.js'
import {
  applyMapCanvasBackground,
  resolveMapStyleSpriteUrls,
} from '#lib/map/styles/runtime.js'
// THEME / I18N
import { getThemeModel } from '#lib/themes/theme.svelte.js'
import { getLocaleKey } from '#lib/i18n.js'
// DOMAIN
import {
  BRAND_LOCATION_STATES,
  brandLocationBounds,
  type BrandLocationMapPoint,
} from '#lib/locations/brandLocationMap.js'
// TYPES
import type { Map as MapLibreMap } from 'maplibre-gl'

let {
  points,
  missing,
  busy,
  selected,
  onselect,
  failure = '',
  onretry,
  active = true,
  focusRequest = null,
}: {
  focusRequest?: { coordinates: [number, number] } | null
  active?: boolean
  points: BrandLocationMapPoint[]
  missing: number
  busy: boolean
  selected: string | null
  onselect: (id: string) => void
  failure?: string
  onretry: () => void
} = $props()
let map = $state.raw<MapLibreMap>()
const theme = getThemeModel()
const styleKey = $derived(theme?.resolvedMapStyle)
const style = $derived(
  applyRuntimeBasemapSource(
    resolveMapStyleSpriteUrls(
      buildCatalogMapStyle(
        styleKey && isMapStyleKey(styleKey) ? styleKey : getDefaultMapStyleKey(),
        { locale: getLocaleKey() },
      ),
    ),
    getConfiguredBasemapAccessToken(),
  ),
)
$effect(() => {
  if (!map) return
  applyMapCanvasBackground(map.getContainer(), style, map)
})
let renderer = $state.raw<ReturnType<typeof installBrandLocationCanvas>>()
let fitted = false
$effect(() => {
  if (!map) return
  const instance = installBrandLocationCanvas(map, id => onselect(id))
  renderer = instance
  // Respect a user who starts moving before the first result page arrives.
  const moved = (event: { originalEvent?: unknown }) => {
    if (event.originalEvent) fitted = true
  }
  map.on('movestart', moved)
  return () => {
    map?.off('movestart', moved)
    instance.destroy()
  }
})
$effect(() => {
  renderer?.update(points)
})
$effect(() => {
  renderer?.setSelected(selected)
})
$effect(() => {
  const bounds = brandLocationBounds(points)
  if (map && bounds && active && !fitted) {
    fitted = true
    untrack(() => map?.fitBounds(bounds, { padding: 70, maxZoom: 16, duration: 0 }))
  }
})
// Explicit list selections pan once; ordinary marker clicks and data refreshes keep the camera.
$effect(() => {
  if (!map || !active || !focusRequest) return
  const instance = map
  const coordinates = focusRequest.coordinates
  fitted = true
  untrack(() => instance.easeTo({ center: coordinates, duration: 350 }))
})
$effect(() => {
  if (map && active) requestAnimationFrame(() => map?.resize())
})
</script>

<section
  class="absolute inset-0 overflow-hidden"
  aria-label="Location results map"
  data-brand-location-map
  data-point-count={points.length}
>
  <MapSurface
    bind:map
    {style}
    center={[114.17, 22.3]}
    zoom={11}
    attributionControl={false}
    class="h-full w-full"
  >
    <NavigationControl />
    <AttributionControl position="bottom-left" />
  </MapSurface>
  <span class="sr-only" role="status"
    >{busy
      ? 'Loading results…'
      : missing
        ? `${missing} results without coordinates`
        : 'Locations loaded'}</span
  >
  {#if failure}
    <div class="absolute top-3 left-3 z-10" title={failure}>
      <Button
        text="Retry search"
        iconComponent={RetryIcon}
        onClick={onretry}
        disabled={busy}
        style="outline"
        size="sm"
        class="bg-panel shadow-sm"
      />
    </div>
  {/if}
  <section
    class="border-border bg-panel absolute right-2 bottom-2 max-w-[calc(100%-4rem)] rounded-lg border p-2 text-xs shadow-sm"
    aria-label="Map legend"
  >
    <svg
      viewBox="0 0 172 98"
      class="h-[98px] w-[172px] max-w-full"
      role="img"
      aria-label="No on the left, Yes on the right. Outer ring: HYPE; middle ring: SaanSeoi; centre: Features."
    >
      <title>
        Clusters show the location count and proportion present in each ring.
      </title>
      <text x="24" y="11" text-anchor="middle" fill="currentColor" font-size="11">
        No
      </text>
      <text x="64" y="11" text-anchor="middle" fill="currentColor" font-size="11">
        Yes
      </text>
      {#each BRAND_LOCATION_STATES as state, index}
        {@const radius = 36 - index * 12}
        <path
          d={`M44 ${56 - radius} A${radius} ${radius} 0 0 0 44 ${56 + radius}`}
          fill="none"
          stroke="#808793"
          stroke-width="2"
        />
        <path
          d={`M44 ${56 - radius} A${radius} ${radius} 0 0 1 44 ${56 + radius}`}
          fill="none"
          stroke={state.yes}
          stroke-width="9"
        />
      {/each}
      <path d="M44 20V92" stroke="var(--color-panel)" stroke-width="2" />
      <g fill="none" stroke="currentColor" stroke-width="1" opacity="0.65">
        <path d="M64 28 L92 24 H108" />
        <path d="M65 52 H108" />
        <path d="M50 61 L86 80 H108" />
      </g>
      <g fill="currentColor">
        <circle cx="64" cy="28" r="2" />
        <circle cx="65" cy="52" r="2" />
        <circle cx="50" cy="61" r="2" />
        <text x="114" y="28" font-size="12">HYPE</text>
        <text x="114" y="56" font-size="12">SaanSeoi</text>
        <text x="114" y="84" font-size="12">Features</text>
      </g>
    </svg>
  </section>
</section>
