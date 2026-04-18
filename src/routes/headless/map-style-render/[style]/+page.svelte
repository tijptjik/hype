<script lang="ts">
import { page } from '$app/state'
import maplibregl, { type MapOptions } from 'maplibre-gl'
import { onMount } from 'svelte'

import { MAP_STYLE_RENDER_VIEW } from '$lib/map/styles/render.shared'
import { isMapStyleKey } from '$lib/map/styles'

let mapContainer: HTMLDivElement
let previewReady = $state(false)

const parseNumber = (value: string | null, fallback: number): number => {
  if (!value) return fallback

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

onMount(() => {
  const url = new URL(window.location.href)
  const styleParam = page.params.style ?? 'hyper'
  const style = isMapStyleKey(styleParam)
    ? `/api/mapStyles/${styleParam}`
    : `/api/mapStyles/hyper`
  const previewWindow = window as Window & {
    __HYPE_MAP_STYLE_PREVIEW_READY__?: boolean
  }

  previewWindow.__HYPE_MAP_STYLE_PREVIEW_READY__ = false
  previewReady = false

  const mapOptions: MapOptions & { preserveDrawingBuffer?: boolean } = {
    container: mapContainer,
    style,
    center: [
      parseNumber(url.searchParams.get('lng'), MAP_STYLE_RENDER_VIEW.lng),
      parseNumber(url.searchParams.get('lat'), MAP_STYLE_RENDER_VIEW.lat),
    ],
    zoom: parseNumber(url.searchParams.get('zoom'), MAP_STYLE_RENDER_VIEW.zoom),
    bearing: parseNumber(
      url.searchParams.get('bearing'),
      MAP_STYLE_RENDER_VIEW.bearing,
    ),
    pitch: parseNumber(url.searchParams.get('pitch'), MAP_STYLE_RENDER_VIEW.pitch),
    interactive: false,
    attributionControl: false,
    preserveDrawingBuffer: true,
    fadeDuration: 0,
  }

  const markReady = () => {
    window.clearTimeout(idleFallback)
    previewWindow.__HYPE_MAP_STYLE_PREVIEW_READY__ = true
    previewReady = true
  }

  const map = new maplibregl.Map(mapOptions)
  const idleFallback = window.setTimeout(markReady, 10_000)

  map.once('idle', markReady)

  return () => {
    window.clearTimeout(idleFallback)
    map.remove()
  }
})
</script>

<svelte:head>
  <style>
  html,
  body {
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: #000;
  }
  </style>
</svelte:head>

<div bind:this={mapContainer} class="preview-map"></div>
<div
  id="map-style-render-ready"
  data-ready={previewReady ? 'true' : 'false'}
  aria-hidden="true"
  class="preview-ready-signal"
></div>

<style>
.preview-map {
  width: 100vw;
  height: 100vh;
}

.preview-ready-signal {
  position: fixed;
  left: 0;
  top: 0;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>
