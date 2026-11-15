// DATA
import catalogue from '../routing/mtr-catalog.json'
// TYPES
import type { Collection } from './model'

/** Build station labels at persistent catalogue coordinates, independently of footprint parts.
 * @param footprints Localized footprint features with station codes.
 * @returns One point per known station, retaining building label geometry.
 * @remarks Catalogue coordinates are stored longitude/latitude anchors, never viewport-derived.
 */
export function stationLabelFeatures(footprints: Collection): Collection {
  const seen = new Set<string>()
  return {
    type: 'FeatureCollection',
    features: footprints.features.flatMap(feature => {
      if (!feature.properties.isStation) return [feature]
      const code = String(feature.properties.stationCode)
      const station = catalogue.stations.find(entry => entry.id === code)
      if (!station || seen.has(code)) return []
      seen.add(code)
      return [
        {
          ...feature,
          geometry: { type: 'Point' as const, coordinates: [...station.coordinates] },
        },
      ]
    }),
  }
}
