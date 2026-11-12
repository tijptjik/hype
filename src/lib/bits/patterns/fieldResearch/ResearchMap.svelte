<script lang="ts">
// PRESENTATION
import { researchStackLayout } from '#lib/fieldResearch/presentation.js'
// THEME
import { getThemeModel } from '#lib/themes/theme.svelte.js'
// MAP
import { Marker } from 'svelte-maplibre-gl'
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
// I18N
import { getLocaleKey } from '#lib/i18n.js'
// TYPES
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type {
  ResearchImage,
  ResearchStack,
  ResearchCoordinates,
} from '#lib/fieldResearch/model.js'

let {
  sessionId,
  stacks,
  images,
  selected,
  disabled = false,
  onselect,
  onplace,
  onmove,
  onmerge,
  types = [],
  onsave,
}: {
  sessionId: string
  stacks: ResearchStack[]
  images: ResearchImage[]
  selected: string | null
  disabled?: boolean
  onselect: (id: string) => void
  onplace: (id: string, coordinates: ResearchCoordinates) => Promise<boolean>
  onmove: (
    imageId: string,
    stackId: string | null,
    coordinates?: ResearchCoordinates,
  ) => Promise<boolean>
  onmerge: (sourceStackId: string, targetStackId: string) => Promise<boolean>
  types?: { id: string; label: string }[]
  onsave: (stackId: string, name: string, featureType: string) => void
} = $props()
let map = $state.raw<MapLibreMap>()
let ready = $state(false)
let visibleIds = $state<string[]>([])
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
const byStack = $derived.by(() => {
  const result = new Map<string, ResearchImage[]>()
  for (const image of images)
    if (image.stackId) {
      const group = result.get(image.stackId) ?? []
      group.push(image)
      result.set(image.stackId, group)
    }
  return result
})
const visible = $derived(
  stacks.filter(
    stack =>
      visibleIds.includes(stack.id) &&
      stack.longitude !== null &&
      stack.latitude !== null,
  ),
)

$effect(() => {
  if (!map) return
  const target = map
  applyMapCanvasBackground(target.getContainer(), style, target)
  const load = (): void => {
    if (target.getSource('research')) {
      ready = true
      return
    }
    target.addSource('research', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      cluster: true,
      clusterMaxZoom: 17,
      clusterRadius: 55,
    })
    target.addLayer({
      id: 'research-clusters',
      type: 'circle',
      source: 'research',
      filter: ['has', 'point_count'],
      paint: { 'circle-color': '#235462', 'circle-radius': 24 },
    })
    target.addLayer({
      id: 'research-count',
      type: 'symbol',
      source: 'research',
      filter: ['has', 'point_count'],
      layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 13 },
      paint: { 'text-color': '#fff' },
    })
    target.addLayer({
      id: 'research-points',
      type: 'circle',
      source: 'research',
      filter: ['!', ['has', 'point_count']],
      paint: { 'circle-color': '#235462', 'circle-radius': 10 },
    })
    ready = true
  }
  const updateVisible = (): void => {
    if (!target.getLayer('research-points')) return
    visibleIds = [
      ...new Set(
        target
          .queryRenderedFeatures({ layers: ['research-points'] })
          .map(feature => String(feature.properties?.id)),
      ),
    ].slice(0, 100)
  }
  const click = (event: import('maplibre-gl').MapMouseEvent): void => {
    if (!target.getLayer('research-clusters')) return
    const cluster = target.queryRenderedFeatures(event.point, {
      layers: ['research-clusters'],
    })[0]
    if (cluster?.geometry.type === 'Point')
      target.easeTo({
        center: cluster.geometry.coordinates as [number, number],
        zoom: target.getZoom() + 2,
      })
  }
  target.on('style.load', load)
  target.on('idle', updateVisible)
  target.on('moveend', updateVisible)
  target.on('click', click)
  if (target.isStyleLoaded()) load()
  return () => {
    target.off('style.load', load)
    target.off('idle', updateVisible)
    target.off('moveend', updateVisible)
    target.off('click', click)
    ready = false
  }
})
let fitted = false
$effect(() => {
  if (!map || !ready) return
  const points = stacks.filter(
    stack => stack.longitude !== null && stack.latitude !== null,
  )
  const source = map.getSource('research') as GeoJSONSource | undefined
  if (!source) return
  source.setData({
    type: 'FeatureCollection',
    features: points.map(stack => ({
      type: 'Feature',
      properties: { id: stack.id },
      geometry: { type: 'Point', coordinates: [stack.longitude!, stack.latitude!] },
    })),
  })
  if (!fitted && points.length) {
    fitted = true
    const bounds = points.reduce(
      (extent, point) => [
        Math.min(extent[0], point.longitude!),
        Math.min(extent[1], point.latitude!),
        Math.max(extent[2], point.longitude!),
        Math.max(extent[3], point.latitude!),
      ],
      [Infinity, Infinity, -Infinity, -Infinity],
    )
    map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      {
        padding: { top: 260, bottom: 180, left: 100, right: 100 },
        maxZoom: 18,
        duration: 0,
      },
    )
  }
})

let hovered = $state<string | null>(null)
let draggingPhotoStack = $state<string | null>(null)
let dragging = $state<{
  id: string
  coordinates: ResearchCoordinates
  x: number
  y: number
  moved: boolean
  offsetX: number
  offsetY: number
} | null>(null)

// Hide the old source dot while its numbered handle previews a new placement.
$effect(() => {
  if (!map || !ready || !map.getLayer('research-points')) return
  map.setPaintProperty('research-points', 'circle-opacity', [
    'case',
    [
      'in',
      ['get', 'id'],
      [
        'literal',
        [...(dragging ? [dragging.id] : []), ...Object.keys(pendingPositions)],
      ],
    ],
    0,
    1,
  ])
})

/** Translate a screen-space drop into a precise working marker coordinate.
 * @param event Pointer or drag event. @returns Map longitude and latitude.
 */
function coordinatesAt(event: MouseEvent): ResearchCoordinates | null {
  if (!map) return null
  const bounds = map.getCanvas().getBoundingClientRect()
  const point = map.unproject([event.clientX - bounds.left, event.clientY - bounds.top])
  return [point.lng, point.lat]
}

/** Drop a single capture onto open map space, atomically separating and placing it.
 * @param event Native image drop event. @returns Nothing.
 */
function dropOnMap(event: DragEvent): void {
  event.preventDefault()
  const imageId = event.dataTransfer?.getData('application/x-field-research-image')
  const coordinates = coordinatesAt(event)
  if (imageId && coordinates && !disabled) void movePhoto(imageId, null, coordinates)
}

/** Capture only the numbered handle; expanded photographs remain individually draggable.
 * @param event Pointer press. @param stack Working stack. @returns Nothing.
 */
function startMarkerDrag(event: PointerEvent, stack: ResearchStack): void {
  if (
    disabled ||
    stack.featureId ||
    event.button !== 0 ||
    stack.longitude === null ||
    stack.latitude === null
  )
    return
  event.preventDefault()
  event.stopPropagation()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragging = {
    id: stack.id,
    coordinates: [stack.longitude, stack.latitude],
    x: event.clientX,
    y: event.clientY,
    moved: false,
    offsetX:
      event.clientX -
      (map?.getCanvas().getBoundingClientRect().left ?? 0) -
      (map?.project([stack.longitude, stack.latitude]).x ?? 0),
    offsetY:
      event.clientY -
      (map?.getCanvas().getBoundingClientRect().top ?? 0) -
      (map?.project([stack.longitude, stack.latitude]).y ?? 0),
  }
}

/** Keep the placement target under the pointer while retaining the gallery at half opacity.
 * @param event Captured pointer movement. @returns Nothing.
 */
function moveMarker(event: PointerEvent): void {
  if (!dragging) return
  const coordinates = map
    ? (map
        .unproject([
          event.clientX -
            map.getCanvas().getBoundingClientRect().left -
            dragging.offsetX,
          event.clientY -
            map.getCanvas().getBoundingClientRect().top -
            dragging.offsetY,
        ])
        .toArray() as ResearchCoordinates)
    : null
  if (!coordinates) return
  dragging = {
    ...dragging,
    coordinates,
    moved:
      dragging.moved ||
      Math.hypot(event.clientX - dragging.x, event.clientY - dragging.y) > 4,
  }
}

/** Persist a moved marker, or toggle its fields for a simple click.
 * @param event Captured pointer release. @returns Nothing.
 */
function finishMarker(event: PointerEvent): void {
  if (!dragging) return
  const value = dragging
  const target = mergeTargetId
  ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
  if (value.moved) {
    pendingPositions = { ...pendingPositions, [value.id]: value.coordinates }
    void (
      target ? onmerge(value.id, target) : onplace(value.id, value.coordinates)
    ).finally(() => {
      const next = { ...pendingPositions }
      delete next[value.id]
      pendingPositions = next
    })
  } else onselect(value.id)
  dragging = null
}

let pendingPositions = $state<Record<string, ResearchCoordinates>>({})
let trackDraggingId = $state<string | null>(null)
let pendingPhotos = $state<string[]>([])
const trackPhotos = $derived(
  images.filter(photo => {
    const stack = stacks.find(item => item.id === photo.stackId)
    return (
      photo.state === 'uploaded' &&
      (!stack || stack.longitude === null || stack.latitude === null)
    )
  }),
)
const mergeTargetId = $derived.by(() => {
  if (!dragging?.moved || !map) return null
  const point = map.project(dragging.coordinates)
  let closest: string | null = null,
    distance = 48
  for (const stack of stacks) {
    if (
      stack.id === dragging.id ||
      stack.featureId ||
      stack.longitude === null ||
      stack.latitude === null
    )
      continue
    const target = map.project([stack.longitude, stack.latitude])
    const current = Math.hypot(target.x - point.x, target.y - point.y)
    if (current < distance) {
      closest = stack.id
      distance = current
    }
  }
  return closest
})

/** Hide a pending track placement immediately and restore it on cancellation or failure.
 * @param imageId Capture identity. @param targetStackId Merge target or null. @param coordinates New map point.
 * @returns Once the durable edit has settled.
 */
async function movePhoto(
  imageId: string,
  targetStackId: string | null,
  coordinates?: ResearchCoordinates,
): Promise<void> {
  pendingPhotos = [...pendingPhotos, imageId]
  try {
    await onmove(imageId, targetStackId, coordinates)
  } finally {
    pendingPhotos = pendingPhotos.filter(id => id !== imageId)
  }
}
</script>

<section
  class="relative h-full min-h-0 w-full overflow-hidden [&_.maplibregl-ctrl-bottom-right]:bottom-28"
  aria-label="Research map"
  ondragover={event => event.preventDefault()}
  ondrop={dropOnMap}
>
  <MapSurface bind:map {style} center={[114.17, 22.3]} zoom={12} class="h-full w-full">
    {#each visible as stack (stack.id)}
      {@const photos = byStack.get(stack.id) ?? []}
      {@const expanded =
        photos.length > 1 &&
        (hovered === stack.id ||
          selected === stack.id ||
          draggingPhotoStack === stack.id)}
      {@const moving = dragging?.id === stack.id}
      {@const layout = researchStackLayout(photos.length)}
      <Marker
        lnglat={moving && dragging
          ? dragging.coordinates
          : (pendingPositions[stack.id] ?? [stack.longitude!, stack.latitude!])}
      >
        {#snippet content()}
          <fieldset
            class="relative m-0 min-w-0 border-0 p-0"
            aria-label={`Stack with ${photos.length} images`}
            onmouseenter={() => (hovered = stack.id)}
            onmouseleave={() => (hovered = null)}
            ondragover={event => {
              event.preventDefault()
              event.stopPropagation()
              hovered = stack.id
            }}
            ondrop={event => {
              event.preventDefault()
              event.stopPropagation()
              const id = event.dataTransfer?.getData(
                'application/x-field-research-image',
              )
              if (id && !disabled && !stack.featureId) void movePhoto(id, stack.id)
            }}
          >
            <div
              class="absolute bottom-4 left-1/2 origin-bottom -translate-x-1/2 transition-opacity"
              style:opacity={moving ? 0.5 : 1}
            >
              <div
                class="relative transition-[width,height] duration-300 ease-[cubic-bezier(.2,1.4,.4,1)]"
                style:width={`${expanded ? layout.width : photos.length === 1 ? 64 : 72}px`}
                style:height={`${expanded ? layout.height : 76}px`}
              >
                {#each expanded
                  ? photos
                  : photos.slice(0, 4) as photo, index (photo.id)}
                  <button
                    type="button"
                    draggable={!disabled && !stack.featureId}
                    {disabled}
                    aria-label={`Drag ${photo.filename} from stack`}
                    class="border-base-100 bg-base-100 focus-visible:ring-primary absolute h-[72px] w-16 rounded-lg border-2 shadow-md transition-[transform,opacity] duration-300 ease-[cubic-bezier(.2,1.4,.4,1)] focus-visible:ring-2"
                    style:transform={expanded
                      ? `translate(${layout.positions[index].x}px, ${layout.positions[index].y}px)`
                      : `translate(${Math.min(index, 3) * 3}px, ${-Math.min(index, 3) * 3}px)`}
                    style:opacity={expanded || index < 4 ? 1 : 0}
                    style:pointer-events={expanded || index === 0 ? 'auto' : 'none'}
                    onclick={() => {
                      draggingPhotoStack = null
                      onselect(stack.id)
                    }}
                    onmousedowncapture={event => {
                      event.stopPropagation()
                      draggingPhotoStack = stack.id
                    }}
                    ondragendcapture={() => (draggingPhotoStack = null)}
                    ondragstartcapture={event => {
                      event.stopPropagation()
                      event.dataTransfer?.setData(
                        'application/x-field-research-image',
                        photo.id,
                      )
                    }}
                  >
                    <img
                      src={`/api/fieldresearch/${sessionId}/images/${photo.id}?preview=1`}
                      alt={photo.filename}
                      draggable={false}
                      class="h-full w-full rounded object-cover"
                    >
                  </button>
                {/each}
              </div>
            </div>
            <button
              type="button"
              aria-label={`Move stack with ${photos.length} images`}
              {disabled}
              aria-pressed={selected === stack.id}
              class:ring-4={mergeTargetId === stack.id ||
                Boolean(moving && mergeTargetId)}
              class:ring-accent={mergeTargetId === stack.id ||
                Boolean(moving && mergeTargetId)}
              class:scale-125={mergeTargetId === stack.id}
              style:transition="box-shadow 150ms, transform 150ms"
              class="border-primary bg-base-100 text-primary relative z-10 flex size-8 cursor-grab touch-none items-center justify-center rounded-full border-2 shadow-md active:cursor-grabbing"
              onpointerdowncapture={event => startMarkerDrag(event, stack)}
              onpointermove={moveMarker}
              onpointerup={finishMarker}
              onpointercancel={() => (dragging = null)}
              onclick={event => {
                if (event.detail === 0) onselect(stack.id)
              }}
            >
              {#if moving}
                <span class="bg-primary size-2 rounded-full"></span>
              {:else}
                {photos.length}
              {/if}
            </button>
            {#if selected === stack.id && !moving}
              <fieldset
                class="bg-base-100/95 absolute top-10 left-1/2 z-20 w-56 -translate-x-1/2 space-y-2 rounded-xl p-3 shadow-xl"
                aria-label="Stack details"
                onpointerdowncapture={event => event.stopPropagation()}
                onmousedowncapture={event => event.stopPropagation()}
                ontouchstartcapture={event => event.stopPropagation()}
                ondblclick={event => event.stopPropagation()}
                onkeydown={event => event.stopPropagation()}
                onwheel={event => event.stopPropagation()}
              >
                <label class="block text-xs"
                  >Feature type
                  <select
                    aria-label="Feature type"
                    disabled={disabled || Boolean(stack.featureId)}
                    value={stack.featureType ?? ''}
                    class="border-base-content/20 bg-base-100 mt-1 w-full rounded-lg border p-2 text-sm"
                    onchange={event =>
                      onsave(stack.id, stack.name ?? '', event.currentTarget.value)}
                  >
                    <option value="">Choose a type</option>
                    {#each types as type}
                      <option value={type.id}>{type.label}</option>
                    {/each}
                  </select>
                </label>
                <label class="block text-xs"
                  >Name
                  <input
                    aria-label="Stack name"
                    disabled={disabled || Boolean(stack.featureId)}
                    value={stack.name ?? ''}
                    maxlength="200"
                    class="border-base-content/20 bg-base-100 mt-1 w-full rounded-lg border p-2 text-sm"
                    onchange={event =>
                      onsave(
                        stack.id,
                        event.currentTarget.value,
                        stack.featureType ?? '',
                      )}
                  >
                </label>
              </fieldset>
            {/if}
          </fieldset>
        {/snippet}
      </Marker>
    {/each}
  </MapSurface>
  <section
    aria-label="Research photo track"
    ondrop={event => {
      event.preventDefault()
      event.stopPropagation()
    }}
    class="pointer-events-none absolute right-0 bottom-0 left-0 z-20 flex h-28 [scrollbar-width:thin] gap-3 overflow-x-auto p-3"
  >
    {#each trackPhotos as photo (photo.id)}
      {@const stack = stacks.find(item => item.id === photo.stackId)}
      <button
        type="button"
        draggable={!disabled && !stack?.featureId}
        {disabled}
        aria-label={`Drag ${photo.filename} onto map`}
        style:opacity={trackDraggingId === photo.id || pendingPhotos.includes(photo.id)
          ? 0
          : 1}
        style:width={trackDraggingId === photo.id || pendingPhotos.includes(photo.id)
          ? '0px'
          : '80px'}
        class="pointer-events-auto relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border-2 bg-base-100 {selected ===
        photo.stackId
          ? 'border-primary'
          : 'border-transparent'}"
        onclick={() => {
          if (photo.stackId) {
            onselect(photo.stackId)
            if (stack?.longitude !== null && stack?.latitude !== null && stack)
              map?.easeTo({
                center: [stack.longitude, stack.latitude],
                zoom: Math.max(map.getZoom(), 17),
              })
          }
        }}
        ondragstart={event => {
          event.dataTransfer?.setData('application/x-field-research-image', photo.id)
          setTimeout(() => {
            trackDraggingId = photo.id
          }, 0)
        }}
        ondragend={() => (trackDraggingId = null)}
      >
        <img
          src={`/api/fieldresearch/${sessionId}/images/${photo.id}?preview=1`}
          alt={photo.filename}
          draggable={false}
          loading="lazy"
          class="h-full w-full object-cover"
        >
        {#if stack?.longitude === null}
          <span class="bg-base-100/90 absolute right-0 bottom-0 left-0 text-xs"
            >No GPS</span
          >
        {/if}
      </button>
    {/each}
  </section>
</section>
