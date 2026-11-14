// MAP
import type { Map as MapLibreMap, GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl'
// DOMAIN
import { BRAND_LOCATION_STATES, type BrandLocationMapPoint } from './brandLocationMap'

const sourceId = 'brand-location-results'
const layerId = 'brand-location-markers'
const spiderSourceId = `${sourceId}-expanded`
const spiderLayerId = `${layerId}-expanded`
const selectionSourceId = `${sourceId}-selection`
const selectionLayerId = `${layerId}-selection`
const selectionHaloId = `${selectionLayerId}-halo`

/** Install clustered GPU symbols with proportional status rings and coincident-point expansion.
 * @param map Map instance. @param select Marker selection callback.
 * @returns Update and disposal functions; no per-location DOM is created.
 */
export function installBrandLocationCanvas(
  map: MapLibreMap,
  select: (id: string) => void,
): {
  update: (points: BrandLocationMapPoint[]) => void
  setSelected: (id: string | null) => void
  destroy: () => void
} {
  let points: BrandLocationMapPoint[] = []
  let selectedId: string | null = null
  const expandedPositions = new Map<string, [number, number]>()
  /** Keep a contrasting selection outline on the viewed Location, including expanded pins.
   * @returns Nothing; updates only the small selection source, without rebuilding clusters.
   */
  function syncSelection(): void {
    if (!map.getStyle()) return
    const point = points.find(point => point.id === selectedId)
    const source = map.getSource(selectionSourceId) as GeoJSONSource | undefined
    if (!point && !source) return
    const data: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: 'FeatureCollection',
      features: point
        ? [
            {
              type: 'Feature',
              properties: { id: point.id },
              geometry: {
                type: 'Point',
                coordinates: expandedPositions.get(point.id) ?? point.coordinates,
              },
            },
          ]
        : [],
    }
    if (source) source.setData(data)
    else map.addSource(selectionSourceId, { type: 'geojson', data })
    for (const [id, color, width] of [
      [selectionHaloId, '#101015', 6],
      [selectionLayerId, '#fff4dc', 3],
    ] as const) {
      if (!map.getLayer(id))
        map.addLayer({
          id,
          source: selectionSourceId,
          type: 'circle',
          paint: {
            'circle-radius': 20,
            'circle-opacity': 0,
            'circle-stroke-color': color,
            'circle-stroke-width': width,
            'circle-pitch-alignment': 'viewport',
          },
        })
      // Expansion symbols are installed later; keep the outline above them.
      map.moveLayer(id)
    }
  }
  /** Synchronize data after a result update or a basemap style reload. */
  function sync(): void {
    // A failed or still-loading basemap source must not block location symbols.
    if (!map.getStyle()) return
    for (let mask = 0; mask < 8; mask++) {
      const present = [
        Number(Boolean(mask & 1)),
        Number(Boolean(mask & 2)),
        Number(Boolean(mask & 4)),
      ]
      addSprite(`brand-status-${mask}`, 1, present)
      if (points.some(point => point.shape === 'square'))
        addSprite(`brand-status-${mask}-square`, 1, present, true)
    }
    const data: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: 'FeatureCollection',
      features: points.map(point => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: point.coordinates },
        properties: {
          hype: Number(point.hype),
          upstream: Number(point.upstream),
          linked: Number(point.linked),
          id: point.id,
          name: point.name,
          icon: `brand-status-${Number(point.hype) + 2 * Number(point.upstream) + 4 * Number(point.linked)}${point.shape === 'square' ? '-square' : ''}`,
        },
      })),
    }
    const source = map.getSource(sourceId) as GeoJSONSource | undefined
    if (source) source.setData(data)
    else
      map.addSource(sourceId, {
        type: 'geojson',
        data,
        cluster: true,
        clusterRadius: 40,
        clusterMaxZoom: 14,
        maxzoom: 18,
        clusterProperties: {
          hype: ['+', ['get', 'hype']],
          upstream: ['+', ['get', 'upstream']],
          linked: ['+', ['get', 'linked']],
        },
      })
    if (!map.getLayer(layerId))
      map.addLayer({
        id: layerId,
        type: 'symbol',
        source: sourceId,
        layout: {
          'icon-image': [
            'case',
            ['has', 'point_count'],
            [
              'concat',
              'brand-cluster-',
              ['to-string', ['get', 'point_count']],
              '-',
              ['to-string', ['get', 'hype']],
              '-',
              ['to-string', ['get', 'upstream']],
              '-',
              ['to-string', ['get', 'linked']],
            ],
            ['get', 'icon'],
          ],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      })
    if (!map.getLayer(spiderLayerId)) expandedPositions.clear()
    syncSelection()
  }
  /** Draw one reusable symbol; cluster arcs encode the fraction present in each dimension. */
  function addSprite(
    id: string,
    count: number,
    present: number[],
    square = false,
  ): void {
    if (map.hasImage(id)) return
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = count > 1 ? 112 : 72
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const center = canvas.width / 2
    ctx.beginPath()
    ctx.fillStyle = '#20232b'
    if (square) ctx.rect(center - 30, center - 30, 60, 60)
    else ctx.arc(center, center, count > 1 ? 49 : 30, 0, Math.PI * 2)
    ctx.fill()
    BRAND_LOCATION_STATES.forEach((state, index) => {
      const radius = (count > 1 ? 46 : 28) - index * (count > 1 ? 10 : 9)
      ctx.beginPath()
      ctx.strokeStyle = '#808793'
      ctx.lineWidth = 2
      if (square) ctx.rect(center - radius, center - radius, radius * 2, radius * 2)
      else ctx.arc(center, center, radius, 0, Math.PI * 2)
      ctx.stroke()
      if (present[index] > 0) {
        ctx.beginPath()
        ctx.strokeStyle = state.yes
        ctx.lineWidth = 6
        if (square) ctx.rect(center - radius, center - radius, radius * 2, radius * 2)
        else
          ctx.arc(
            center,
            center,
            radius,
            -Math.PI / 2,
            -Math.PI / 2 + (Math.PI * 2 * present[index]) / count,
          )
        ctx.stroke()
      }
    })
    if (count > 1) {
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 23px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(count), center, center, 42)
    }
    map.addImage(id, ctx.getImageData(0, 0, canvas.width, canvas.height), {
      pixelRatio: 2,
    })
  }
  /** Generate only the cluster combinations requested by the rendered map. */
  function missingImage(id: string): void {
    const match = /^brand-cluster-(\d+)-(\d+)-(\d+)-(\d+)$/.exec(id)
    if (match) addSprite(id, Number(match[1]), match.slice(2).map(Number))
  }
  /** Clear temporary screen-space expansion when the map moves or results change. */
  function clearExpansion(): void {
    if (map.getLayer(spiderLayerId)) map.removeLayer(spiderLayerId)
    if (map.getSource(spiderSourceId)) map.removeSource(spiderSourceId)
    expandedPositions.clear()
    syncSelection()
  }
  /** Zoom clusters or spread coincident locations without modifying their stored coordinates. */
  async function click(event: MapLayerMouseEvent): Promise<void> {
    const feature = event.features?.[0]
    if (!feature) return
    if (!feature.properties?.cluster) {
      const overlaps =
        event.features?.filter(
          item =>
            item.geometry.type === 'Point' &&
            feature.geometry.type === 'Point' &&
            item.geometry.coordinates[0] === feature.geometry.coordinates[0] &&
            item.geometry.coordinates[1] === feature.geometry.coordinates[1],
        ) ?? []
      if (overlaps.length > 1 && feature.geometry.type === 'Point') {
        spread(overlaps, feature.geometry.coordinates as [number, number])
        return
      }
      const id = feature.properties?.id
      if (typeof id === 'string') select(id)
      return
    }
    const source = map.getSource(sourceId) as GeoJSONSource
    const clusterId = Number(feature.properties.cluster_id)
    const zoom = await source.getClusterExpansionZoom(clusterId)
    if (feature.geometry.type !== 'Point') return
    const center = feature.geometry.coordinates as [number, number]
    if (zoom <= map.getMaxZoom()) {
      map.easeTo({ center, zoom, duration: 350 })
      return
    }
    const leaves = await source.getClusterLeaves(
      clusterId,
      Number(feature.properties.point_count),
      0,
    )
    spread(leaves, center)
  }
  /** Expand overlapping points in screen space without modifying their geographic data. */
  function spread(leaves: GeoJSON.Feature[], center: [number, number]): void {
    clearExpansion()
    const anchor = map.project(center)
    const features = leaves.map((leaf, index) => {
      const ring = Math.floor(Math.sqrt(index / 8)) + 1
      const first = 8 * (ring - 1) ** 2
      const slots = 8 * (2 * ring - 1)
      const angle =
        ((index - first) * Math.PI * 2) / Math.min(slots, leaves.length - first)
      const position = map.unproject([
        anchor.x + Math.cos(angle) * ring * 48,
        anchor.y + Math.sin(angle) * ring * 48,
      ])
      if (typeof leaf.properties?.id === 'string')
        expandedPositions.set(leaf.properties.id, [position.lng, position.lat])
      return {
        type: 'Feature' as const,
        properties: { ...leaf.properties },
        geometry: { type: 'Point' as const, coordinates: [position.lng, position.lat] },
      }
    })
    map.addSource(spiderSourceId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features },
    })
    map.addLayer({
      id: spiderLayerId,
      source: spiderSourceId,
      type: 'symbol',
      layout: { 'icon-image': ['get', 'icon'], 'icon-allow-overlap': true },
    })
    syncSelection()
  }
  const enter = (event: MapLayerMouseEvent) => {
    map.getCanvas().style.cursor = 'pointer'
    map.getCanvas().title = String(
      event.features?.[0]?.properties?.name ??
        `${event.features?.[0]?.properties?.point_count ?? ''} locations — click to expand`,
    )
  }
  const leave = () => {
    map.getCanvas().style.cursor = ''
    map.getCanvas().title = ''
  }
  map.on('style.load', sync)
  map.setMissingStyleImageResolver(missingImage)
  map.on('movestart', clearExpansion)
  map.on('click', spiderLayerId, click)
  map.on('click', layerId, click)
  map.on('mousemove', [layerId, spiderLayerId], enter)
  map.on('mouseleave', [layerId, spiderLayerId], leave)
  return {
    update(next: BrandLocationMapPoint[]): void {
      clearExpansion()
      points = next
      sync()
    },
    setSelected(id: string | null): void {
      selectedId = id
      syncSelection()
    },
    destroy(): void {
      selectedId = null
      clearExpansion()
      for (const id of [selectionLayerId, selectionHaloId])
        if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(selectionSourceId)) map.removeSource(selectionSourceId)
      map.setMissingStyleImageResolver(null)
      map.off('movestart', clearExpansion)
      map.off('click', spiderLayerId, click)
      map.off('style.load', sync)
      map.off('click', layerId, click)
      map.off('mousemove', [layerId, spiderLayerId], enter)
      map.off('mouseleave', [layerId, spiderLayerId], leave)
      if (map.getLayer(layerId)) map.removeLayer(layerId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    },
  }
}
