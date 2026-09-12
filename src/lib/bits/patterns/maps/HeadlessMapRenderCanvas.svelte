<script lang="ts">
// SVELTE
import { onMount, tick } from 'svelte'
import { page } from '$app/state'
// GEO
import bbox from '@turf/bbox'
// COMPONENTS
import MapSurface from '$lib/bits/custom/map/MapSurface.svelte'
// MAP
import { createMarkerRenderer, type MarkerRenderer } from '$lib/map/markers'
import { loadMapLibre } from '$lib/map/maplibreAssets'
import { getDefaultMapStyleKey, isMapStyleKey } from '$lib/map/styles'
import { resolveRuntimeMapStyle } from '$lib/map/styles/runtime'
import {
  MAP_RENDER_READY_TIMEOUT_MS,
  waitForMapEvent,
  waitForMarkerImages,
} from '$lib/map/render-readiness'
// TYPES
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'
import type {
  FitBoundsOptions,
  LngLatBoundsLike,
  Map as MaplibreMap,
  ErrorEvent,
  StyleSpecification,
} from 'maplibre-gl'
import * as maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'

type HeadlessRenderKind = 'projects' | 'layers'
type RenderPayload = {
  styleCode: string
  features: FeatureFromCollection[]
  layers: Array<{ id: string; rank: number; modifiedAt: string }>
  selectedLayerIds: string[]
}

const PREVIEW_PADDING_RATIO = 0.05
const HK_BOUNDS = [
  [114.0028131, 22.1193278],
  [114.3228131, 22.4393278],
] as LngLatBoundsLike

let { kind, identifier }: { kind: HeadlessRenderKind; identifier: string } = $props()
let map = $state<MaplibreMap | undefined>(undefined)
let payload = $state<RenderPayload | null>(null)
let style = $state<StyleSpecification | null>(null)
let runtimeReady = $state(false)
let previewReady = $state(false)
let previewError = $state<string | null>(null)
let renderKey = $state('')
let markerRenderer: MarkerRenderer | null = null
let styleAbortController: AbortController | null = null
let renderRequestSerial = 0
let styleRevision = $state(0)

const previewWindow = (): Window & {
  __HYPE_MAP_STYLE_PREVIEW_READY__?: boolean
  __HYPE_MAP_STYLE_PREVIEW_ERROR__?: string
} =>
  window as Window & {
    __HYPE_MAP_STYLE_PREVIEW_READY__?: boolean
    __HYPE_MAP_STYLE_PREVIEW_ERROR__?: string
  }

const markReady = (): void => {
  previewError = null
  previewWindow().__HYPE_MAP_STYLE_PREVIEW_ERROR__ = undefined
  previewWindow().__HYPE_MAP_STYLE_PREVIEW_READY__ = true
  previewReady = true
}

const markError = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error)
  previewError = message
  previewWindow().__HYPE_MAP_STYLE_PREVIEW_READY__ = false
  previewWindow().__HYPE_MAP_STYLE_PREVIEW_ERROR__ = message
  console.error('Failed to render headless map preview', error)
}

const handleMapError = (event: ErrorEvent): void => {
  if (!previewReady) markError(event.error ?? new Error('Map style failed to load'))
}

const resetReadySignal = (): void => {
  previewWindow().__HYPE_MAP_STYLE_PREVIEW_READY__ = false
  previewWindow().__HYPE_MAP_STYLE_PREVIEW_ERROR__ = undefined
  previewReady = false
  previewError = null
}

const getRenderPadding = (): FitBoundsOptions['padding'] => ({
  top: Math.round(window.innerHeight * PREVIEW_PADDING_RATIO),
  right: Math.round(window.innerWidth * PREVIEW_PADDING_RATIO),
  bottom: Math.round(window.innerHeight * PREVIEW_PADDING_RATIO),
  left: Math.round(window.innerWidth * PREVIEW_PADDING_RATIO),
})

const fitRenderViewport = (
  mapInstance: MaplibreMap,
  features: FeatureFromCollection[],
): void => {
  if (features.length === 0) {
    mapInstance.fitBounds(HK_BOUNDS, {
      padding: getRenderPadding(),
      duration: 0,
      maxZoom: 12,
    } satisfies FitBoundsOptions)
    return
  }
  const featureCollection = {
    type: 'FeatureCollection',
    features: features.map(feature => ({
      type: 'Feature',
      geometry: feature.geometry,
      properties: feature.properties,
    })),
  } as const
  const [west, south, east, north] = bbox(
    featureCollection as unknown as FeatureCollection,
  )
  if (west === east && south === north) {
    mapInstance.jumpTo({ center: [west, south], zoom: 16 })
    return
  }
  mapInstance.fitBounds(
    [
      [west, south],
      [east, north],
    ] as LngLatBoundsLike,
    {
      padding: getRenderPadding(),
      duration: 0,
      maxZoom: 16,
    } satisfies FitBoundsOptions,
  )
}

const loadRenderPayload = async (): Promise<void> => {
  const currentUrl = new URL(window.location.href)
  const payloadUrl = new URL(
    `/api/mapRenders/${kind}/${identifier}/render`,
    currentUrl.origin,
  )
  const token = currentUrl.searchParams.get('token')
  if (token) payloadUrl.searchParams.set('token', token)
  const response = await fetch(payloadUrl, { cache: 'no-store' })
  if (!response.ok)
    throw new Error(`Failed to load ${kind} render payload (${response.status})`)
  payload = (await response.json()) as RenderPayload
}

onMount(() => {
  resetReadySignal()
  const run = async (): Promise<void> => {
    await loadMapLibre()
    runtimeReady = true
    await loadRenderPayload()
  }
  void run().catch(markError)
  return () => {
    renderRequestSerial += 1
    styleAbortController?.abort()
    markerRenderer?.clear()
    markerRenderer = null
  }
})

$effect(() => {
  const nextPayload = payload
  if (!nextPayload) return
  const locale = page.url.searchParams.get('locale') ?? 'en'
  const noLabels = page.url.searchParams.get('noLabels') === '1'
  const styleCode = isMapStyleKey(nextPayload.styleCode)
    ? nextPayload.styleCode
    : getDefaultMapStyleKey()
  styleAbortController?.abort()
  const controller = new AbortController()
  styleAbortController = controller
  void resolveRuntimeMapStyle(styleCode, {
    locale,
    noLabels,
    signal: controller.signal,
  })
    .then(nextStyle => {
      if (!controller.signal.aborted) {
        style = nextStyle
        styleRevision += 1
      }
    })
    .catch(error => {
      if ((error as Error)?.name !== 'AbortError') markError(error)
    })
  return () => controller.abort()
})

$effect(() => {
  if (!runtimeReady || !style || !map || !payload) return
  const locale = page.url.searchParams.get('locale') ?? 'en'
  const noLabels = page.url.searchParams.get('noLabels') === '1'
  const nextRenderKey = JSON.stringify({
    styleCode: payload.styleCode,
    selectedLayerIds: payload.selectedLayerIds,
    featureIds: payload.features.map(feature => feature.id),
    locale,
    noLabels,
    styleRevision,
  })
  if (renderKey === nextRenderKey) return
  const serial = ++renderRequestSerial
  renderKey = nextRenderKey
  markerRenderer ??= createMarkerRenderer(map, maplibregl)
  markerRenderer.sync(payload.features, { markerStyle: 'image' })
  resetReadySignal()
  void (async () => {
    if (!map.loaded()) await waitForMapEvent(map, 'load', MAP_RENDER_READY_TIMEOUT_MS)
    if (serial !== renderRequestSerial) return
    await tick()
    fitRenderViewport(map, payload.features)
    await waitForMapEvent(map, 'idle', MAP_RENDER_READY_TIMEOUT_MS)
    if (serial !== renderRequestSerial) return
    await waitForMarkerImages(document, MAP_RENDER_READY_TIMEOUT_MS)
    if (serial !== renderRequestSerial) return
    markReady()
  })().catch(error => {
    if (serial === renderRequestSerial) markError(error)
  })
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

<div class="headless-map-render">
  {#if runtimeReady && style}
    <MapSurface
      bind:map
      class="absolute inset-0"
      {style}
      center={[114.17276, 22.29191]}
      zoom={14}
      bearing={17.6}
      pitch={45}
      attributionControl={false}
      interactive={false}
      hash={false}
      fadeDuration={0}
      canvasContextAttributes={{ antialias: true, preserveDrawingBuffer: true }}
      onerror={handleMapError}
    />
  {/if}
</div>
<div
  id="map-style-render-ready"
  data-ready={previewReady ? 'true' : 'false'}
  data-error={previewError ?? undefined}
  aria-hidden="true"
  class="headless-map-render__ready"
></div>

<style>
.headless-map-render {
  position: relative;
  width: 100vw;
  height: 100vh;
}
.headless-map-render__ready {
  position: fixed;
  left: 0;
  top: 0;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>
