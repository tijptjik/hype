<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import AppSurface from '#lib/bits/patterns/layout/app/components/AppSurface.svelte'
import AppMain from '#lib/bits/patterns/layout/app/components/AppMain.svelte'
import MapSurface from '#lib/bits/custom/map/MapSurface.svelte'
import OmnibarRoot from '#lib/bits/patterns/bars/omnibar/components/OmnibarRoot.svelte'
import AppMenu from '#lib/bits/patterns/bars/appMenu/AppMenu.svelte'
import PanelRoot from '#lib/bits/patterns/panels/components/PanelRoot.svelte'
// MAP
import { observeFirstMapFrame } from '#lib/map/firstFrame.js'
// ENUMS
import { Panel } from '#lib/enums.js'
// ICONS
import LocationIcon from 'virtual:icons/proicons/location'
// TYPES
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'

const responsive = setResponsiveCtx()
responsive.setWindowDimensions(window.innerWidth, window.innerHeight)
responsive.setViewportDimensions(window.innerWidth, window.innerHeight)
const mapMode = new URLSearchParams(window.location.search).get('map')
const offsetX = window.innerWidth >= 768 ? 48 : 0
let showMap = $state(mapMode !== 'missing' && mapMode !== 'late')
let map = $state.raw<MapLibreMap>()
let painted = $state(false)
let readyAt = $state<number | null>(null)
let selected = $state('Explore')
let generation = $state(0)
let fadeCurrentMap = $state(true)

onMount(() => {
  if (mapMode !== 'late') return
  const timer = setTimeout(() => {
    showMap = true
  }, 1900)
  return () => clearTimeout(timer)
})

/**
 * Provides a real map frame without external tile or image dependencies.
 * @param alternate - Whether to use the post-navigation color.
 * @returns A deterministic locally rendered basemap.
 */
function mapStyle(alternate = false): StyleSpecification {
  return {
    version: 8,
    sources: {
      waterfront: {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [114.13, 22.34],
                [114.14, 22.31],
                [114.155, 22.305],
                [114.175, 22.32],
                [114.2, 22.325],
                [114.2, 22.34],
                [114.13, 22.34],
              ],
            ],
          },
        },
      },
    },
    layers: [
      {
        id: 'water',
        type: 'background',
        paint: { 'background-color': alternate ? '#d2e5e8' : '#b7d8e1' },
      },
      {
        id: 'land',
        type: 'fill',
        source: 'waterfront',
        paint: { 'fill-color': '#efe9dc' },
      },
      {
        id: 'shore',
        type: 'line',
        source: 'waterfront',
        paint: { 'line-color': '#709ca0', 'line-width': 3 },
      },
    ],
  }
}

const initialStyle = mapStyle()

/**
 * Connects the same first-frame signal as MapCanvas to the production entrance.
 * @param _node - Existing map wrapper receiving the action.
 * @param initial - Bound map instance.
 * @returns Update and disposal hooks for the current map listener.
 */
function watchFirstFrame(
  _node: HTMLElement,
  initial: { map?: MapLibreMap },
): { update: (value: typeof initial) => void; destroy: () => void } {
  let cleanup: (() => void) | undefined
  const update = ({ map }: typeof initial): void => {
    cleanup?.()
    if (!map || painted) return
    cleanup = observeFirstMapFrame(map, () => {
      painted = true
      readyAt = performance.now()
    })
  }
  update(initial)
  return { update, destroy: () => cleanup?.() }
}
</script>

<main class="bits-theme bg-surface text-base-content h-dvh w-full overflow-hidden">
  {#key generation}
    <AppSurface intro={generation === 0 ? 'complete' : 'waiting'}>
      <div
        data-intro-map
        data-generation={generation}
        data-ready-at={readyAt}
        data-map-visual-ready={painted}
        class={[
          'absolute inset-0',
          fadeCurrentMap &&
            'transition-opacity delay-400 duration-300 ease-out motion-reduce:transition-none motion-reduce:delay-0',
        ]}
        style:opacity={fadeCurrentMap && !painted ? 0 : undefined}
        use:watchFirstFrame={{ map }}
      >
        {#if showMap}
          <MapSurface
            bind:map
            class="absolute inset-0"
            style={initialStyle}
            center={[114.17, 22.32]}
            zoom={12.5}
            attributionControl={false}
            canvasContextAttributes={{ antialias: true }}
          />
        {/if}
      </div>
      {#if window.innerWidth >= 768}
        <PanelRoot
          panelType={Panel.filters}
          position="left"
          isOpen
          scrollable
          inline={false}
          isNarrow={false}
          isAdmin={false}
        >
          <div class="p-6">
            <h2 class="text-lg font-semibold">Your map</h2>
            <p class="mt-3 text-sm">Find places worth exploring.</p>
          </div>
        </PanelRoot>
      {/if}
      <AppMain>
        <OmnibarRoot
          class="pointer-events-auto relative z-50 mx-6 mt-6"
          hasElevatedChrome
          style="transform: translateX({offsetX}px); --omni-effective-main-width: {window.innerWidth}px; --omni-x-gutter: 24px;"
        >
          <label class="border-border bg-panel flex rounded-2xl border p-4 shadow-lg">
            <input
              aria-label="Search places"
              placeholder="Search places"
              class="w-full bg-transparent outline-none"
            >
          </label>
        </OmnibarRoot>
        <output
          data-selection
          data-app-intro-item="overlay"
          class="bg-panel pointer-events-auto absolute top-28 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2 shadow"
        >
          {selected}
        </output>
        <AppMenu
          {offsetX}
          items={['Explore', 'Saved', 'Settings'].map(label => ({
            label,
            value: label,
            icon: LocationIcon,
          }))}
          onSelect={item => {
            selected = item.value
            if (item.value === 'Explore') {
              // Rebootstrap the surface while preserving the enclosing layout's completion.
              painted = false
              readyAt = null
              map = undefined
              fadeCurrentMap = false
              generation++
              return
            }
            // Repeated visual-ready and route/style updates must not replay the intro.
            if (map) painted = true
            map?.setStyle(mapStyle(true))
            const url = new URL(window.location.href)
            url.searchParams.set('panel', item.value.toLowerCase())
            window.history.replaceState({}, '', url)
          }}
        />
      </AppMain>
    </AppSurface>
  {/key}
</main>
