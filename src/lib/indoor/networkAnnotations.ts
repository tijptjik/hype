// DATA
import experiment from './kennedy-town-connectors.json'
import manifest from './network-connectors/manifest.json'
import { networkConnectorLoaders } from './network-connectors/loaders'
// DOMAIN
import { value, type IndoorData, type IndoorFeature } from './model'
// TYPES
import type { EditorDirection } from './connectionEditor'

export type NetworkAnnotation = {
  exterior: boolean
  path: number[][]
  width: number
  edgeId: string
  entrance: number[]
  destination: number[]
  rise: number
  travel: string
  geometry: unknown
  levelId: string
  floorZ: number
  category: string
}
type NetworkExperiment = {
  venueId: string
  sourceUrl: string
  annotations: Record<string, NetworkAnnotation>
}
const experiments = new Map<string, NetworkExperiment>([
  [experiment.venueId, experiment],
])
const loaders: Record<string, () => Promise<{ default: NetworkExperiment }>> =
  networkConnectorLoaders
const pending = new Map<string, Promise<void>>()
const stationCodes = new Map<string, string>(
  Object.entries(manifest).flatMap(([code, entry]) =>
    'venueId' in entry ? [[entry.venueId, code] as const] : [],
  ),
)

/** Load only this venue's immutable source matches before exposing its map to rendering or editing.
 * @param data Current map snapshot. @returns Completion; failed chunk loads can be retried.
 * @remarks Exact geometry guards still apply after loading. No draft or published release is changed.
 */
export async function loadNetworkAnnotations(data: IndoorData): Promise<void> {
  if (data.coordinateSpace) return
  const venueId = value(data.venue_polygon.features[0]?.properties ?? {}, 'venue_id')
  if (experiments.has(venueId)) return
  const code = stationCodes.get(venueId)
  if (!code) return
  let request = pending.get(venueId)
  if (!request) {
    request = (async () => {
      const module = await loaders[code]()
      if (module.default.venueId !== venueId)
        throw new Error('Connector source venue mismatch')
      experiments.set(venueId, module.default)
    })().finally(() => pending.delete(venueId))
    pending.set(venueId, request)
  }
  await request
}

/** Read a source-pinned physical slope without transferring it to changed geometry.
 * @param data Current map. @param unit Exact source unit.
 * @returns Source-pinned match, or undefined after any structural source change.
 * @remarks Physical rise and permitted travel are independent. No routing edge is created.
 */
export function networkAnnotation(
  data: IndoorData,
  unit: IndoorFeature,
): NetworkAnnotation | undefined {
  if (data.coordinateSpace) return undefined
  const source = experiments.get(
    value(data.venue_polygon.features[0]?.properties ?? {}, 'venue_id'),
  )
  if (!source) return undefined
  const annotation = source.annotations[value(unit.properties, 'unit_id')]
  const floor = data.level_polygon.features.find(
    f => f.properties.level_id === unit.properties.level_id,
  )
  if (
    !annotation ||
    !floor ||
    annotation.category !== unit.properties.unit_category ||
    annotation.levelId !== unit.properties.level_id ||
    annotation.floorZ !== Number(floor.properties.level_z_value) ||
    JSON.stringify(annotation.geometry) !== JSON.stringify(unit.geometry)
  )
    return undefined
  return annotation
}

/** Suggest travel only when both polygons identify the same directed source segment.
 * @param data Current map. @param left Origin pane polygon. @param right Destination polygon.
 * @returns Pane-relative source direction, or undefined for unmatched or conflicting evidence.
 */
export function networkPairDirection(
  data: IndoorData,
  left: IndoorFeature,
  right: IndoorFeature,
): EditorDirection | undefined {
  const a = networkAnnotation(data, left),
    b = networkAnnotation(data, right)
  if (
    !a ||
    !b ||
    a.edgeId !== b.edgeId ||
    a.levelId === b.levelId ||
    Math.sign(a.rise) === Math.sign(b.rise)
  )
    return undefined
  if (a.travel === 'both' && b.travel === 'both') return 'both'
  if (a.travel === 'outward' && b.travel === 'inward') return 'forward'
  if (a.travel === 'inward' && b.travel === 'outward') return 'reverse'
  return undefined
}

/** Join opposite source-matched landings without overriding an authored pair.
 * @param data Current immutable map. @returns Source-backed pairs, excluding ambiguous segment groups.
 * @remarks Boundary continuations are not fabricated second-floor endpoints.
 */
export function networkConnections(
  data: IndoorData,
): import('./releases').MapConnection[] {
  const groups = new Map<
    string,
    { unit: IndoorFeature; annotation: NetworkAnnotation }[]
  >()
  for (const unit of data.unit_polygon.features) {
    const annotation = networkAnnotation(data, unit)
    if (!annotation || annotation.exterior) continue
    groups.set(annotation.edgeId, [
      ...(groups.get(annotation.edgeId) ?? []),
      { unit, annotation },
    ])
  }
  const result: import('./releases').MapConnection[] = []
  for (const matches of groups.values()) {
    if (matches.length !== 2) continue
    const [a, b] = matches
    const direction = networkPairDirection(data, a.unit, b.unit)
    if (!direction) continue
    const reverse = direction === 'reverse'
    const from = reverse ? b : a,
      to = reverse ? a : b
    const fromId = value(from.unit.properties, 'unit_id'),
      toId = value(to.unit.properties, 'unit_id')
    if (
      data.connections?.some(
        c =>
          (c.from === fromId && c.to === toId) || (c.to === fromId && c.from === toId),
      )
    )
      continue
    result.push({
      from: fromId,
      to: toId,
      fromLevel: from.annotation.levelId,
      toLevel: to.annotation.levelId,
      category: from.annotation
        .category as import('./releases').MapConnection['category'],
      direction: direction === 'both' ? 'both' : 'forward',
      enabled: true,
      evidence: 'source-network',
      evidenceUrl: experiments.get(
        value(data.venue_polygon.features[0]?.properties ?? {}, 'venue_id'),
      )?.sourceUrl,
    })
  }
  return result
}

/** List sloping fixtures without a valid network match in stable floor/source order.
 * @param data Current map after loading its source annotations.
 * @returns Unmatched stairs, steps, escalators and ramps, excluding lifts.
 * @remarks Authored connections do not remove a source mismatch; browsing never changes corrections.
 */
export function unmatchedNetworkConnectors(data: IndoorData): IndoorFeature[] {
  const floors = new Map(
    data.level_polygon.features.map((floor, index) => [
      value(floor.properties, 'level_id'),
      index,
    ]),
  )
  return data.unit_polygon.features
    .filter(
      unit =>
        ['stairs', 'steps', 'escalator', 'ramp'].includes(
          value(unit.properties, 'unit_category'),
        ) && !networkAnnotation(data, unit),
    )
    .sort(
      (a, b) =>
        (floors.get(value(a.properties, 'level_id')) ?? Infinity) -
          (floors.get(value(b.properties, 'level_id')) ?? Infinity) ||
        value(a.properties, 'unit_id').localeCompare(value(b.properties, 'unit_id')),
    )
}
