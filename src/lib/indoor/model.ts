import type { Feature, FeatureCollection, Geometry } from 'geojson'

export type Properties = Record<string, unknown>
export type IndoorFeature = Feature<Geometry, Properties>
export type Collection = FeatureCollection<Geometry, Properties>
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
  retrievedAt: string
}
export type Place = {
  id: string
  levelId: string
  name: { en: string; 'zh-Hant': string }
  code: string
  category: string
  area: string
  feature: IndoorFeature
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
    const code = /^(?:KET|HOK)\s*\d+[A-Z]?(?:\s*[-/&]\s*\d+[A-Z]?)*$/i.test(
      value(p, 'unit_name_en'),
    )
      ? value(p, 'unit_name_en')
      : ''
    const named = occupants.filter(
      f => !/^(?:KET|HOK)\s*\d+/i.test(value(f.properties, 'occupant_name_en')),
    )
    result.push({
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
  const get = async (name: string) => {
    const response = await fetch(`${base}/${name}.json`, { signal })
    if (!response.ok) throw new Error(`Could not load ${name} (${response.status})`)
    return response.json()
  }
  const manifest = await get('manifest')
  const result = { retrievedAt: manifest.retrievedAt } as IndoorData
  for (const name of layerNames) {
    const data = await get(name)
    const entry = manifest.entries.find((e: { layer: string }) => e.layer === name)
    if (
      data.type !== 'FeatureCollection' ||
      !Array.isArray(data.features) ||
      data.features.length !== entry?.count
    )
      throw new Error(`Incomplete ${name} data`)
    for (const f of data.features) {
      if (f.properties?.venue_id !== manifest.venueId)
        throw new Error(`Unexpected venue in ${name}`)
    }
    result[name] = data
  }
  return result
}

/** Chooses the source concourse for initial detail. @param data Complete snapshot. @returns Concourse or the first available level. */
export function initialLevel(data: IndoorData): IndoorFeature {
  const level =
    data.level_polygon.features.find(f =>
      /^Concourse Level/.test(value(f.properties, 'level_name_en')),
    ) ?? data.level_polygon.features[0]
  if (!level) throw new Error('No station levels are available')
  return level
}
