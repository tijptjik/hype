import { networkAnnotation, networkConnections } from './networkAnnotations'
import {
  bounds,
  centre,
  collection,
  value,
  type Collection,
  type IndoorData,
  type IndoorFeature,
  type Place,
} from './model'
import type { Geometry } from 'geojson'
import { footprintFrame } from './geometry'
export const connectorCategories = ['stairs', 'steps', 'escalator', 'elevator', 'ramp']
/** Recognises level-change facilities. @param category Source category. @returns Whether the facility changes levels. */
export const isConnector = (category: string): boolean =>
  connectorCategories.includes(category)
/** Recognises routes and access facilities in the place directory.
 * @param category Source facility category. @returns Whether the entry supports circulation.
 * @remarks Shop and amenity categories remain visible independently of circulation.
 */
export function isCirculation(category: string): boolean {
  return (
    isConnector(category) ||
    [
      'walkway',
      'movingwalkway',
      'corridor',
      'lobby',
      'platform',
      'entry',
      'entrance',
      'exit',
      'faregate',
      'gate',
      'door',
      'passage',
    ].includes(category)
  )
}
export type Connection = {
  fromExterior?: import('./releases').ExteriorEndpoint
  toExterior?: import('./releases').ExteriorEndpoint
  from: string
  to: string
  fromLevel: string
  toLevel: string
  category: string
  direction?: 'both' | 'forward' | null
  enabled?: boolean
  evidenceUrl?: string
  evidence:
    | 'aligned-footprints'
    | 'matching-lift-code'
    | 'reviewed-layout'
    | 'editor-verified'
    | 'source-network'
}
/** Reads the explicit access section. @param feature Source unit. @returns Paid, unpaid or unknown. */
export function accessArea(
  feature: IndoorFeature,
): 'Paid area' | 'Unpaid area' | 'Unknown' {
  const name = value(feature.properties, 'section_name_en')
  return name === 'Paid area' || name === 'Unpaid area' ? name : 'Unknown'
}
/** Finds conservative display candidates. @param data Source snapshot. @returns Mutually best overlapping connectors. @remarks These are never a routing graph. */
export function connectionCandidates(data: IndoorData): Connection[] {
  if (data.connections)
    return [...data.connections.filter(c => c.enabled), ...networkConnections(data)]
  const units = data.unit_polygon.features.filter(f =>
    isConnector(value(f.properties, 'unit_category')),
  )
  const score = (a: IndoorFeature, b: IndoorFeature) => {
    if (
      a.properties.level_id === b.properties.level_id ||
      a.properties.unit_category !== b.properties.unit_category ||
      accessArea(a) !== accessArea(b)
    )
      return 0
    if (a.properties.unit_category === 'elevator') {
      const nameA = value(a.properties, 'unit_name_en'),
        nameB = value(b.properties, 'unit_name_en')
      if (/^L\d+$/.test(nameA) && /^L\d+$/.test(nameB)) return nameA === nameB ? 2 : 0
    }
    const aa = bounds(a),
      bb = bounds(b)
    const overlap =
      Math.max(0, Math.min(aa[2], bb[2]) - Math.max(aa[0], bb[0])) *
      Math.max(0, Math.min(aa[3], bb[3]) - Math.max(aa[1], bb[1]))
    const size = Math.min(
      (aa[2] - aa[0]) * (aa[3] - aa[1]),
      (bb[2] - bb[0]) * (bb[3] - bb[1]),
    )
    return size > 0 ? overlap / size : 0
  }
  const best = (a: IndoorFeature, direction: number) => {
    const candidates = units
      .filter(
        b =>
          Math.sign(
            Number(b.properties.level_z_value) - Number(a.properties.level_z_value),
          ) === direction,
      )
      .map(b => ({ b, overlap: score(a, b) }))
      .filter(c => c.overlap >= 0.2)
      .sort(
        (a, b) =>
          b.overlap - a.overlap ||
          Number(a.b.properties.level_z_value) - Number(b.b.properties.level_z_value),
      )
    const first = candidates[0]
    if (!first || (candidates[1] && first.overlap - candidates[1].overlap < 0.1))
      return undefined
    return first.b
  }
  const result: Connection[] = networkConnections(data)
  for (const a of units) {
    const b = best(a, 1)
    if (!b || best(b, -1) !== a) continue
    if (
      result.some(
        c =>
          (c.from === a.properties.unit_id && c.to === b.properties.unit_id) ||
          (c.to === a.properties.unit_id && c.from === b.properties.unit_id),
      )
    )
      continue
    result.push({
      from: value(a.properties, 'unit_id'),
      to: value(b.properties, 'unit_id'),
      fromLevel: value(a.properties, 'level_id'),
      toLevel: value(b.properties, 'level_id'),
      category: value(a.properties, 'unit_category'),
      evidence:
        value(a.properties, 'unit_category') === 'elevator' &&
        /^L\d+$/.test(value(a.properties, 'unit_name_en')) &&
        a.properties.unit_name_en === b.properties.unit_name_en
          ? 'matching-lift-code'
          : 'aligned-footprints',
    })
  }
  return result
}
/** Separates ordinal groups for a schematic plan. @param data Source snapshot. @returns Display offsets by level. */
export function levelOffsets(data: IndoorData): Map<string, number> {
  const ordinals = [
    ...new Set(
      data.level_polygon.features.map(f => Number(f.properties.level_ordinal)),
    ),
  ].sort((a, b) => a - b)
  return new Map(
    data.level_polygon.features.map(f => [
      value(f.properties, 'level_id'),
      ordinals.indexOf(Number(f.properties.level_ordinal)) * 0.0007,
    ]),
  )
}
/** Copies geometry with a display offset. @param feature Source feature. @param offset Latitude offset. @returns Derived feature without source mutation. */
export function offsetFeature(feature: IndoorFeature, offset: number): IndoorFeature {
  function coordinates(c: unknown): unknown {
    if (!Array.isArray(c)) return c
    if (typeof c[0] === 'number') return [c[0], Number(c[1]) + offset, ...c.slice(2)]
    return c.map(coordinates)
  }
  const geometry = feature.geometry
  if (!('coordinates' in geometry)) return feature
  return {
    ...feature,
    geometry: {
      ...geometry,
      coordinates: coordinates(geometry.coordinates),
    } as Geometry,
  }
}
/** Applies schematic offsets. @param data Collection. @param offsets Level offsets. @param all Whether to show all levels. @returns Display collection. */
export function displayCollection(
  data: Collection,
  offsets: Map<string, number>,
  all: boolean,
): Collection {
  return all
    ? collection(
        data.features.map(f =>
          offsetFeature(f, offsets.get(value(f.properties, 'level_id')) ?? 0),
        ),
      )
    : data
}
/** Builds display-only connection lines. @param data Snapshot. @param connections Candidate links. @param offsets Level offsets. @returns Derived lines. */
export function connectionLines(
  data: IndoorData,
  connections: Connection[],
  offsets: Map<string, number>,
): Collection {
  const byId = new Map(
    data.unit_polygon.features.map(f => [value(f.properties, 'unit_id'), f]),
  )
  return collection(
    connections.flatMap(c => {
      const a = byId.get(c.from),
        b = byId.get(c.to)
      if (!a || !b) return []
      const from = centre(offsetFeature(a, offsets.get(c.fromLevel) ?? 0))
      const to = centre(offsetFeature(b, offsets.get(c.toLevel) ?? 0))
      return [
        {
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: [from, to] },
          properties: { from: c.from, to: c.to },
        },
      ]
    }),
  )
}
/** Labels candidate destination heights. @param place Facility. @param connections Candidate links. @returns Label without asserting operating direction. */
export function connectorLabel(place: Place, connections: Connection[]): string {
  const id = value(place.feature.properties, 'unit_id')
  const up = connections.some(c => c.from === id),
    down = connections.some(c => c.to === id)
  return `${up && down ? '↕' : up ? '↑' : down ? '↓' : '↕'} ${place.category === 'elevator' ? 'Lift' : place.category === 'escalator' ? 'Escalator' : 'Stairs'}`
}
/** Clips treads and rails to rotated footprints. @param data Source snapshot. @returns Inset schematic linework, including hole clipping. */
export function stairTreads(data: IndoorData): Collection {
  return collection(
    data.unit_polygon.features.flatMap(feature => {
      const category = value(feature.properties, 'unit_category')
      if (!['stairs', 'steps', 'escalator'].includes(category)) return []
      const annotation = networkAnnotation(data, feature)
      const frame = footprintFrame(
        feature,
        annotation
          ? [
              annotation.destination[0] - annotation.entrance[0],
              annotation.destination[1] - annotation.entrance[1],
            ]
          : undefined,
      )
      if (!frame) return []
      const { minU, maxU, minV, maxV, world, spans } = frame
      const lines: IndoorFeature[] = []
      const line = (position: number, across: boolean, inset: number) => {
        for (const [lo, hi] of spans(position, across)) {
          const margin = Math.min(inset, (hi - lo) * 0.15)
          lines.push({
            type: 'Feature',
            properties: feature.properties,
            geometry: {
              type: 'LineString',
              coordinates: across
                ? [world(position, lo + margin), world(position, hi - margin)]
                : [world(lo + margin, position), world(hi - margin, position)],
            },
          })
        }
      }
      if (category === 'escalator') {
        // Two handrails and landing bars distinguish a moving walkway from stairs.
        for (const t of [0.18, 0.82]) line(minV + (maxV - minV) * t, false, 0.35)
        for (const t of [0.12, 0.88]) line(minU + (maxU - minU) * t, true, 0.35)
      } else {
        const count = Math.max(5, Math.min(24, Math.round((maxU - minU) / 0.4)))
        for (let i = 1; i < count; i++)
          line(minU + ((maxU - minU) * i) / count, true, 0.18)
      }
      return lines
    }),
  )
}

/** Read reviewed operating direction without inferring it from floor height.
 * @param id Connector ID. @param connections Reviewed and inferred map links.
 * @returns Travel along the incline, or null when no reviewed direction is recorded.
 */
export function connectorTravelDirection(
  id: string,
  connections: Connection[],
): 'depart' | 'arrive' | 'both' | null {
  const links = connections.filter(
    c =>
      c.enabled !== false &&
      (c.from === id || c.to === id) &&
      ['editor-verified', 'reviewed-layout', 'source-network'].includes(c.evidence) &&
      c.direction,
  )
  const depart = links.some(c => c.direction === 'both' || c.from === id)
  const arrive = links.some(c => c.direction === 'both' || c.to === id)
  return depart && arrive ? 'both' : depart ? 'depart' : arrive ? 'arrive' : null
}
