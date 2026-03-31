<script lang="ts">
// SVELTE
import { onMount, tick } from 'svelte'
// QUERY
import { QueryClient } from '@tanstack/svelte-query'
// GEO
import bbox from '@turf/bbox'
// CONTEXT
import { setAppCtx } from '$lib/context/app.svelte'
import { setOmniCtx } from '$lib/context/omni.svelte'
import { setPlaceCtx } from '$lib/context/place.svelte'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// COMPONENTS
import MapCanvas from '$lib/components/common/MapCanvas.svelte'
// MAP
import { ensureMapLibreStyles, loadMapLibre } from '$lib/map/maplibreAssets'
import { monkeyPatchMapLibre } from '$lib/map/maplibrePreload'
// TYPES
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'
import type {
  FitBoundsOptions,
  LngLatBoundsLike,
  Map as MaplibreMap,
} from 'maplibre-gl'

type HeadlessRenderKind = 'projects' | 'layers'

type RenderPayload = {
  styleCode: string
  features: FeatureFromCollection[]
  layers: Array<{
    id: string
    rank: number
    modifiedAt: string
  }>
  selectedLayerIds: string[]
}

const PREVIEW_PADDING_RATIO = 0.05
const PREVIEW_READY_TIMEOUT_MS = 10_000
const HK_BOUNDS = [
  [114.0028131, 22.1193278],
  [114.3228131, 22.4393278],
] as LngLatBoundsLike

let {
  kind,
  identifier,
}: {
  kind: HeadlessRenderKind
  identifier: string
} = $props()

const appCtx = setAppCtx(new QueryClient(), setPlaceCtx(), null)
setOmniCtx(appCtx)

let payload = $state<RenderPayload | null>(null)
let previewReady = $state(false)
let renderKey = $state('')

const markReady = (): void => {
  ;(
    window as Window & { __HYPE_MAP_STYLE_PREVIEW_READY__?: boolean }
  ).__HYPE_MAP_STYLE_PREVIEW_READY__ = true
  previewReady = true
}

const resetReadySignal = (): void => {
  ;(
    window as Window & { __HYPE_MAP_STYLE_PREVIEW_READY__?: boolean }
  ).__HYPE_MAP_STYLE_PREVIEW_READY__ = false
  previewReady = false
}

const getRenderPadding = (): FitBoundsOptions['padding'] => ({
  top: Math.round(window.innerHeight * PREVIEW_PADDING_RATIO),
  right: Math.round(window.innerWidth * PREVIEW_PADDING_RATIO),
  bottom: Math.round(window.innerHeight * PREVIEW_PADDING_RATIO),
  left: Math.round(window.innerWidth * PREVIEW_PADDING_RATIO),
})

const fitRenderViewport = (
  map: MaplibreMap,
  features: FeatureFromCollection[],
): void => {
  if (features.length === 0) {
    map.fitBounds(HK_BOUNDS, {
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

  const [west, south, east, north] = bbox(featureCollection)
  const isSinglePoint = west === east && south === north

  if (isSinglePoint) {
    map.jumpTo({
      center: [west, south],
      zoom: 16,
    })
    return
  }

  map.fitBounds(
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

const waitForMapEvent = (
  map: MaplibreMap,
  event: 'load' | 'idle',
  timeoutMs: number,
): Promise<void> =>
  new Promise(resolve => {
    let settled = false

    const finish = (): void => {
      if (settled) {
        return
      }

      settled = true
      window.clearTimeout(timeoutId)
      map.off(event, finish)
      resolve()
    }

    const timeoutId = window.setTimeout(finish, timeoutMs)
    map.once(event, finish)
  })

const waitForMarkerImages = async (root: ParentNode): Promise<void> => {
  const markerImages = Array.from(
    root.querySelectorAll('img.marker-image'),
  ) as HTMLImageElement[]

  await Promise.all(
    markerImages.map(
      image =>
        new Promise<void>(resolve => {
          if (image.complete) {
            resolve()
            return
          }

          const cleanup = (): void => {
            image.removeEventListener('load', cleanup)
            image.removeEventListener('error', cleanup)
            resolve()
          }

          image.addEventListener('load', cleanup, { once: true })
          image.addEventListener('error', cleanup, { once: true })
        }),
    ),
  )
}

const applyRenderPayload = (nextPayload: RenderPayload): void => {
  appCtx.state.resources.project = []
  appCtx.setSortedResourceState(FirstClassResource.layer, nextPayload.layers as never)
  appCtx.setSortedResourceState(
    FirstClassResource.feature,
    nextPayload.features as never,
  )
  appCtx.state.prisms.organisation = []
  appCtx.state.prisms.project = []
  appCtx.state.prisms.layer = [...nextPayload.selectedLayerIds]
  appCtx.state.filters.feature.properties = {}
  appCtx.isInitialised = true
}

const loadRenderPayload = async (): Promise<void> => {
  const currentUrl = new URL(window.location.href)
  const payloadUrl = new URL(
    `/api/mapRenders/${kind}/${identifier}/render`,
    currentUrl.origin,
  )
  const token = currentUrl.searchParams.get('token')

  if (token) {
    payloadUrl.searchParams.set('token', token)
  }

  const response = await fetch(payloadUrl, {
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Failed to load ${kind} render payload (${response.status})`)
  }

  const nextPayload = (await response.json()) as RenderPayload
  payload = nextPayload
  applyRenderPayload(nextPayload)
}

onMount(() => {
  resetReadySignal()

  const run = async (): Promise<void> => {
    const globalWithMaplibre = globalThis as typeof globalThis & {
      maplibregl?: unknown
    }
    const [, loadedMaplibre] = await Promise.all([
      ensureMapLibreStyles(),
      loadMapLibre(),
    ])
    const maplibreSource = globalWithMaplibre.maplibregl ?? loadedMaplibre
    const maplibre = monkeyPatchMapLibre(maplibreSource)
    globalWithMaplibre.maplibregl = maplibre
    appCtx.maplibre = maplibre
    appCtx.isMaplibreLoaded = true

    await loadRenderPayload()
  }

  void run().catch(error => {
    console.error('Failed to initialise headless map preview', error)
    markReady()
  })
})

$effect(() => {
  const map = appCtx.map
  const nextPayload = payload

  if (!map || !nextPayload) {
    return
  }

  const nextRenderKey = JSON.stringify({
    styleCode: nextPayload.styleCode,
    selectedLayerIds: nextPayload.selectedLayerIds,
    featureIds: nextPayload.features.map(feature => feature.id),
  })

  if (renderKey === nextRenderKey) {
    return
  }

  renderKey = nextRenderKey
  resetReadySignal()

  void (async () => {
    if (!map.loaded()) {
      await waitForMapEvent(map, 'load', PREVIEW_READY_TIMEOUT_MS)
    }

    await tick()
    fitRenderViewport(map, nextPayload.features)
    await waitForMapEvent(map, 'idle', PREVIEW_READY_TIMEOUT_MS)
    await waitForMarkerImages(document)
    markReady()
  })().catch(error => {
    console.error('Failed to render headless map preview', error)
    markReady()
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
  <MapCanvas mapStyleCode={payload?.styleCode ?? 'hyper'} />
</div>
<div
  id="map-style-render-ready"
  data-ready={previewReady ? 'true' : 'false'}
  aria-hidden="true"
  class="headless-map-render__ready"
></div>

<style>
.headless-map-render {
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
