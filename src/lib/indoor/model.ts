// FACILITY LABELS
import { canonicalFacilityLabel } from './facilityLabels'
import type { MapConnection } from './releases'
import type { ShopArtwork } from './artwork'
import type { Feature, FeatureCollection, Geometry } from 'geojson'

export type Properties = Record<string, unknown>
export type IndoorFeature = Feature<Geometry, Properties>
export type Collection = FeatureCollection<Geometry, Properties> & {
  coordinateSpace?: 'image-pixels'
}
export const layerNames = [
  'venue_polygon',
  'level_polygon',
  'unit_polygon',
  'opening_line',
  'amenity_point',
  'occupant_point',
] as const
export type LayerName = (typeof layerNames)[number]
export type IndoorData = Record<LayerName, Collection> & {
  attributionLogo?: string
  documents?: { kind: string; path: string }[]
  connections?: MapConnection[]
  releaseHash?: string
  unitArtwork?: Record<string, ShopArtwork>
  retrievedAt: string
  coordinateSpace?: 'image-pixels'
  basePath?: string
  source?: string
  sourceUrl?: string
  unmappedPlaces?: { name: string; nameZh: string; code: string; level: number }[]
}
export type Place = {
  id: string
  levelId: string
  name: { en: string; 'zh-Hant': string }
  code: string
  category: string
  area: string
  feature: IndoorFeature
  artwork?: ShopArtwork
  occupants: IndoorFeature[]
  kind: 'shop' | 'facility'
}
/** Reads a string source property. @param p Source properties. @param key Property name. @returns Text or an empty string. */
export const value = (p: Properties, key: string): string =>
  typeof p[key] === 'string' ? (p[key] as string) : ''
/** Wraps features without altering geometry. @param features Source features. @returns A GeoJSON collection. */
export const collection = (features: IndoorFeature[]): Collection => ({
  type: 'FeatureCollection',
  features,
})
/** Calculates bounds from coordinates. @param feature Source geometry. @returns Longitude/latitude bounds. */
export function bounds(feature: IndoorFeature): [number, number, number, number] {
  const positions: [number, number][] = []
  function visit(c: unknown): void {
    if (!Array.isArray(c)) return
    if (typeof c[0] === 'number' && typeof c[1] === 'number')
      positions.push([c[0], c[1]])
    else c.forEach(visit)
  }
  if ('coordinates' in feature.geometry) visit(feature.geometry.coordinates)
  if (!positions.length) throw new Error('Feature has no coordinates')
  return [
    Math.min(...positions.map(p => p[0])),
    Math.min(...positions.map(p => p[1])),
    Math.max(...positions.map(p => p[0])),
    Math.max(...positions.map(p => p[1])),
  ]
}
/** Finds the centre of a feature extent. @param feature Source geometry. @returns Longitude/latitude centre. */
export function centre(feature: IndoorFeature): [number, number] {
  const b = bounds(feature)
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]
}
/** Joins source occupants and amenities. @param data Complete snapshot. @returns Display places with original identities. @remarks Multiple occupants remain on their source unit. */
export function places(data: IndoorData): Place[] {
  const result: Place[] = []
  for (const feature of data.unit_polygon.features) {
    const p = feature.properties
    const occupants = data.occupant_point.features.filter(
      f => f.properties.unit_id === p.unit_id,
    )
    const firstOccupant = occupants[0]
    const code = /^[A-Z]{2,6}\s*\d+[A-Z]?(?:\s*[-/&]\s*\d+[A-Z]?)*$/i.test(
      value(p, 'unit_name_en'),
    )
      ? value(p, 'unit_name_en')
      : value(p, 'unit_unitnumbername') || ''
    const named = occupants.filter(
      f => !/^[A-Z]{2,6}\s*\d+/i.test(value(f.properties, 'occupant_name_en')),
    )
    result.push({
      artwork: data.unitArtwork?.[value(p, 'unit_id')],
      id: value(p, 'unit_id'),
      levelId: value(p, 'level_id'),
      name: {
        en:
          (named.length ? named : occupants)
            .map(f => value(f.properties, 'occupant_name_en'))
            .join(' · ') ||
          value(p, 'unit_name_en') ||
          value(p, 'unit_category'),
        'zh-Hant':
          named
            .map(f => value(f.properties, 'occupant_name_zh'))
            .filter(Boolean)
            .join(' · ') || value(p, 'unit_name_zh'),
      },
      code,
      category: firstOccupant
        ? value(firstOccupant.properties, 'occupant_category')
        : value(p, 'unit_category'),
      area: value(p, 'section_name_en'),
      feature,
      occupants,
      kind: firstOccupant ? 'shop' : 'facility',
    })
  }
  for (const feature of data.amenity_point.features) {
    const p = feature.properties
    if (value(p, 'amenity_category') === 'unspecified') continue
    result.push({
      id: value(p, 'amenity_id'),
      levelId: value(p, 'level_id'),
      name: {
        en: value(p, 'amenity_name_en') || value(p, 'amenity_category'),
        'zh-Hant': value(p, 'amenity_name_zh'),
      },
      code: '',
      category: value(p, 'amenity_category'),
      area: value(
        data.unit_polygon.features.find(f => f.properties.unit_id === p.unit_id)
          ?.properties ?? {},
        'section_name_en',
      ),
      feature,
      occupants: [],
      kind: 'facility',
    })
  }
  // Older published maps receive the same directory terminology without mutating source features.
  for (const place of result) {
    if (place.kind === 'facility' && !/^(retail|shop)/i.test(place.category))
      place.name.en = canonicalFacilityLabel(place.name.en)
  }
  return result.sort((a, b) =>
    (a.code || a.name.en).localeCompare(b.code || b.name.en, 'en', { numeric: true }),
  )
}
/** Searches source names and kiosk codes. @param place Display place. @param query User text. @returns Whether the place matches. */
export function matches(place: Place, query: string): boolean {
  const normalise = (s: string) => s.toLocaleLowerCase().replace(/[\s-]+/g, '')
  return normalise(
    [
      place.name.en,
      place.name['zh-Hant'],
      place.code,
      place.category,
      place.category === 'elevator' ? 'lift' : '',
    ].join(' '),
  ).includes(normalise(query))
}
/** Loads and validates all six source layers. @param base Snapshot URL. @param signal Optional cancellation signal. @returns A complete venue snapshot. */
export async function loadIndoorData(
  base: string,
  signal?: AbortSignal,
): Promise<IndoorData> {
  // Occupancy and immutable geometry are independent; fetch them concurrently.
  const [bundleResult, unitArtwork] = await Promise.all([
    (async () => {
      const pointerResponse = await fetch(base, { signal, cache: 'no-store' })
      if (!pointerResponse.ok) throw new Error('Could not resolve published map')
      const pointer: { hash: string; url: string } = await pointerResponse.json()
      const response = await fetch(pointer.url, { signal })
      if (!response.ok) throw new Error('Could not load published map release')
      const text = await response.text()
      const { mapHash, validateMapBundle } = await import('./releases')
      if ((await mapHash(text)) !== pointer.hash)
        throw new Error('Map release integrity check failed')
      return { bundle: validateMapBundle(JSON.parse(text)), hash: pointer.hash }
    })(),
    (async () => {
      const presentation = await fetch(`${base}/presentation`, {
        signal,
        cache: 'no-store',
      })
      if (!presentation.ok) throw new Error('Could not load current map occupancy')
      return presentation.json() as Promise<Record<string, ShopArtwork>>
    })(),
  ])
  const { bundle, hash } = bundleResult
  return {
    ...bundle.data,
    basePath: base,
    releaseHash: hash,
    unitArtwork,
    documents: bundle.documents,
  }
}

/** Chooses the source concourse for initial detail. @param data Complete snapshot. @returns Concourse or the first available level. */
export function initialLevel(data: IndoorData): IndoorFeature {
  const level =
    data.level_polygon.features.find(f =>
      /^Concourse Level/.test(value(f.properties, 'level_name_en')),
    ) ??
    data.level_polygon.features.find(f => f.properties.level_ordinal === 0) ??
    data.level_polygon.features[0]
  if (!level) throw new Error('No station levels are available')
  return level
}
