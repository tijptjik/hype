<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// I18N
import { t } from './i18n'
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
          locale: {
            'Map.Title': t('map'),
            'Map.Description': t('map_description'),
            'Marker.Title': t('marker'),
            'NavigationControl.ZoomIn': t('zoom_in'),
            'NavigationControl.ZoomOut': t('zoom_out'),
            'NavigationControl.ResetBearing': t('reset_bearing_to_north'),
            'AttributionControl.ToggleAttribution': t('toggle_attribution'),
          },
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
                  '© <a href="https://api.portal.hkmapservice.gov.hk/disclaimer" target="_blank" rel="noopener">' +
                  t('lands_department') +
                  '</a>',
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
          problem = t('some_street_tiles_could_not_load')
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
        problem = t('the_street_map_could_not_start_on_this_device')
      }
    })
    .catch(() => {
      if (!disposed) problem = t('the_street_map_could_not_start_on_this_device')
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
      'grid size-10 place-items-center rounded-full text-xl text-on-accent'
    element.style.background =
      place.id === locationId ? 'var(--theme-primary)' : 'var(--theme-surface)'
    element.style.color =
      place.id === locationId ? 'var(--theme-on-primary)' : 'var(--theme-text)'
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
  aria-label={t('exterior_map')}
  class="bg-surface h-[46dvh] min-h-64 rounded-xl"
></section>
{#if problem}
  <small role="status">{problem}</small>
{/if}
