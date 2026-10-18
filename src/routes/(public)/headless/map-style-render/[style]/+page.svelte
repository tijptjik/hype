<script lang="ts">
import { page } from '$app/state'
import { onDestroy } from 'svelte'
import type { ErrorEvent, Map as MaplibreMap, StyleSpecification } from 'maplibre-gl'

import MapSurface from '#lib/bits/custom/map/MapSurface.svelte'
import { getDefaultMapStyleKey, isMapStyleKey } from '#lib/map/styles/index.js'
import { MAP_STYLE_RENDER_VIEW } from '#lib/map/styles/render.shared.js'
import { resolveRuntimeMapStyle } from '#lib/map/styles/runtime.js'
import { MAP_RENDER_READY_TIMEOUT_MS } from '#lib/map/render-readiness.js'

let map = $state<MaplibreMap | undefined>(undefined)
let style = $state<StyleSpecification | null>(null)
let previewReady = $state(false)
let previewError = $state<string | null>(null)
let timeoutId: number | null = null
let styleAbortController: AbortController | null = null
let styleRequestSerial = 0

const parseNumber = (value: string | null, fallback: number): number => {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const styleKey = $derived.by(() => {
  const requestedStyle = page.params.style ?? ''
  return isMapStyleKey(requestedStyle) ? requestedStyle : getDefaultMapStyleKey()
})
const styleLocale = $derived(page.url.searchParams.get('locale') ?? 'en')
const styleNoLabels = $derived(page.url.searchParams.get('noLabels') === '1')
const camera = $derived.by(() => ({
  center: [
    parseNumber(page.url.searchParams.get('lng'), MAP_STYLE_RENDER_VIEW.lng),
    parseNumber(page.url.searchParams.get('lat'), MAP_STYLE_RENDER_VIEW.lat),
  ] as [number, number],
  zoom: parseNumber(page.url.searchParams.get('zoom'), MAP_STYLE_RENDER_VIEW.zoom),
  bearing: parseNumber(
    page.url.searchParams.get('bearing'),
    MAP_STYLE_RENDER_VIEW.bearing,
  ),
  pitch: parseNumber(page.url.searchParams.get('pitch'), MAP_STYLE_RENDER_VIEW.pitch),
}))

const previewWindow = (): Window & {
  __HYPE_MAP_STYLE_PREVIEW_READY__?: boolean
  __HYPE_MAP_STYLE_PREVIEW_ERROR__?: string
} =>
  window as Window & {
    __HYPE_MAP_STYLE_PREVIEW_READY__?: boolean
    __HYPE_MAP_STYLE_PREVIEW_ERROR__?: string
  }

const resetReady = (): void => {
  if (timeoutId !== null) window.clearTimeout(timeoutId)
  timeoutId = window.setTimeout(
    () => markError(new Error('Map style preview timed out')),
    MAP_RENDER_READY_TIMEOUT_MS,
  )
  previewReady = false
  previewError = null
  previewWindow().__HYPE_MAP_STYLE_PREVIEW_READY__ = false
  previewWindow().__HYPE_MAP_STYLE_PREVIEW_ERROR__ = undefined
}

const markReady = (): void => {
  if (previewError) return
  if (timeoutId !== null) window.clearTimeout(timeoutId)
  timeoutId = null
  previewReady = true
  previewWindow().__HYPE_MAP_STYLE_PREVIEW_READY__ = true
}

const markError = (error: unknown): void => {
  if (previewReady) return
  if (timeoutId !== null) window.clearTimeout(timeoutId)
  timeoutId = null
  const message = error instanceof Error ? error.message : String(error)
  previewError = message
  previewWindow().__HYPE_MAP_STYLE_PREVIEW_READY__ = false
  previewWindow().__HYPE_MAP_STYLE_PREVIEW_ERROR__ = message
  console.error('Failed to render map style preview', error)
}

const handleMapLoad = (): void => {
  if (previewError || previewReady) return
  if (timeoutId !== null) window.clearTimeout(timeoutId)
  timeoutId = window.setTimeout(
    () => markError(new Error('Map style preview timed out')),
    MAP_RENDER_READY_TIMEOUT_MS,
  )
}
const handleMapIdle = (): void => markReady()
const handleMapError = (event: ErrorEvent): void => {
  if (!previewReady) markError(event.error ?? new Error('Map style failed to load'))
}

$effect(() => {
  const serial = ++styleRequestSerial
  styleAbortController?.abort()
  const controller = new AbortController()
  styleAbortController = controller
  style = null
  resetReady()

  void resolveRuntimeMapStyle(styleKey, {
    locale: styleLocale,
    noLabels: styleNoLabels,
    signal: controller.signal,
  })
    .then(nextStyle => {
      if (serial === styleRequestSerial && !controller.signal.aborted) style = nextStyle
    })
    .catch(error => {
      if ((error as Error)?.name !== 'AbortError') markError(error)
    })

  return () => controller.abort()
})

onDestroy(() => {
  if (timeoutId !== null) window.clearTimeout(timeoutId)
  styleAbortController?.abort()
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

<div class="preview-map">
  {#if style}
    <MapSurface
      bind:map
      {style}
      center={camera.center}
      zoom={camera.zoom}
      bearing={camera.bearing}
      pitch={camera.pitch}
      interactive={false}
      attributionControl={false}
      canvasContextAttributes={{ preserveDrawingBuffer: true }}
      fadeDuration={0}
      onload={handleMapLoad}
      onidle={handleMapIdle}
      onerror={handleMapError}
    />
  {/if}
</div>
<div
  id="map-style-render-ready"
  data-ready={previewReady ? 'true' : 'false'}
  data-error={previewError ?? undefined}
  aria-hidden="true"
  class="preview-ready-signal"
></div>

<style>
.preview-map {
  position: relative;
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
