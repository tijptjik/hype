// TYPES
import type { FilterSpecification, Map as MapLibreMap } from 'maplibre-gl'

/**
 * Lets hidden street names try alternate positions without duplicating visible names.
 * @param map - Map whose style may contain road-label candidate layers.
 * @returns Cleanup function that removes the placement listeners.
 * @remarks Runs after camera/style changes, one candidate layer per settled frame.
 * Native repeated labels keep their spacing; alternatives only fill missing names.
 */
export const installStreetLabelPlacement = (map: MapLibreMap): (() => void) => {
  let needsReset = true
  let candidates: string[] = []
  let nextCandidate = 0

  /** Requests a fresh search after a camera or style change. */
  const reset = (): void => {
    needsReset = true
  }

  /** Advances the search only after the previous placement has settled. */
  const advance = (): void => {
    if (map.isMoving() || !map.isStyleLoaded()) return
    const layers = map.getStyle().layers
    if (needsReset) {
      needsReset = false
      candidates = layers
        .filter(
          layer =>
            layer.id.startsWith('roads_labels_') && layer.id.includes('__shift_'),
        )
        .map(layer => layer.id)
        .reverse()
      nextCandidate = 0
      // Clear old viewport decisions before asking which native names are visible.
      for (const id of candidates) map.setFilter(id, ['==', 'kind', '__disabled__'])
      if (candidates.length) return
    }
    if (nextCandidate >= candidates.length) return

    const labelLayers = layers
      .filter(layer => layer.id.startsWith('roads_labels_'))
      .map(layer => layer.id)
    const visibleNames = [
      ...new Set(
        map
          .queryRenderedFeatures({ layers: labelLayers })
          .map(feature => feature.properties.name)
          .filter((name): name is string => typeof name === 'string'),
      ),
    ]
    const id = candidates[nextCandidate++]
    const originalId = id.split('__shift_')[0]
    const originalFilter = map.getFilter(originalId)
    // Preserve the road-kind policy while excluding names already placed nearby.
    const missingNameFilter: FilterSpecification = ['!in', 'name', ...visibleNames]
    map.setFilter(
      id,
      originalFilter ? ['all', originalFilter, missingNameFilter] : missingNameFilter,
    )
  }

  map.on('style.load', reset)
  map.on('moveend', reset)
  map.on('resize', reset)
  map.on('idle', advance)
  return () => {
    map.off('style.load', reset)
    map.off('moveend', reset)
    map.off('resize', reset)
    map.off('idle', advance)
  }
}
