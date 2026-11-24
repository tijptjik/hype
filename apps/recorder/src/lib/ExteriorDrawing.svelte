<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// MAP
import { Map as StreetMap, Marker, NavigationControl, LngLatBounds } from 'maplibre-gl'
import { loadMapLibre } from '../../../../src/lib/map/maplibreAssets'
// TYPES
import type {
  MapPoint,
  RecorderPlace,
} from '../../../../src/lib/fieldResearch/recorder'
let {
  places,
  locationId,
  point,
  onpick,
}: {
  places: RecorderPlace[]
  locationId: string
  point: MapPoint | null
  onpick?: (point: MapPoint, id: string) => void
} = $props()
let container: HTMLElement
let map = $state.raw<StreetMap>()
let problem = $state('')
onMount(() => {
  let instance: StreetMap | undefined
  let disposed = false
  void loadMapLibre()
    .then(() => {
      if (disposed) return
      try {
        const visible = places.flatMap(p => (p.point ? [p.point] : []))
        const centre: MapPoint = point ??
          places.find(p => p.id === locationId)?.point ??
          visible[0] ?? [114.17, 22.31]
        instance = new StreetMap({
          container,
          center: centre,
          zoom: visible.length || point ? 18 : 10,
          style: {
            version: 8,
            sources: {
              streets: {
                type: 'raster',
                tiles: [
                  'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/basemap/WGS84/{z}/{x}/{y}.png',
                ],
                tileSize: 256,
                maxzoom: 19,
                attribution:
                  '© <a href="https://api.portal.hkmapservice.gov.hk/disclaimer" target="_blank" rel="noopener">Lands Department</a>',
              },
            },
            layers: [{ id: 'streets', type: 'raster', source: 'streets' }],
          },
          attributionControl: { compact: false },
        })
        if (!point && !locationId && visible.length > 1) {
          const bounds = new LngLatBounds()
          for (const coordinate of visible) bounds.extend(coordinate)
          instance.fitBounds(bounds, { padding: 40, maxZoom: 18, duration: 0 })
        }
        instance.addControl(new NavigationControl({ showCompass: false }))
        instance.on('error', () => {
          problem = 'Some street tiles could not load.'
        })
        instance.on('sourcedata', event => {
          if (event.sourceId === 'streets' && event.sourceDataType === 'content')
            problem = ''
        })
        instance.on('click', event => {
          if (locationId)
            onpick?.([event.lngLat.wrap().lng, event.lngLat.lat], locationId)
        })
        map = instance
      } catch {
        problem = 'The street map could not start on this device.'
      }
    })
    .catch(() => {
      if (!disposed) problem = 'The street map could not start on this device.'
    })
  return () => {
    disposed = true
    instance?.remove()
  }
})
$effect(() => {
  if (!map) return
  const markers = places.flatMap(place => {
    if (!place.point || !onpick) return []
    const element = document.createElement('button')
    element.type = 'button'
    element.textContent = '●'
    element.className =
      'grid size-10 place-items-center rounded-full text-xl text-cyan-950'
    element.style.background = place.id === locationId ? '#67e8f9' : '#e2e8f0'
    element.setAttribute('aria-label', place.name)
    element.onclick = event => {
      event.stopPropagation()
      onpick?.(place.point!, place.id)
    }
    return [new Marker({ element }).setLngLat(place.point).addTo(map!)]
  })
  if (point) markers.push(new Marker({ color: '#e84666' }).setLngLat(point).addTo(map))
  return () => {
    for (const marker of markers) marker.remove()
  }
})
$effect(() => {
  const target = places.find(row => row.id === locationId)?.point
  if (map && target) map.easeTo({ center: target, duration: 250 })
})
</script>
<section
  bind:this={container}
  aria-label="Exterior map"
  class="h-[46dvh] min-h-64 rounded-xl bg-slate-800"
></section>
{#if problem}
  <small role="status">{problem}</small>
{/if}
