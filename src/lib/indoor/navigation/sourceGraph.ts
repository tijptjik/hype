// VALIDATION
import { z } from 'zod'
// TYPES
import type { IndoorData, IndoorFeature, Place } from '../model'
import type { IndoorRoute } from '../routing'

const nodeSchema = z.object({
  id: z.string(),
  point: z.tuple([z.number().finite(), z.number().finite()]),
  z: z.number().finite(),
  floorIds: z.array(z.string()),
})
const edgeSchema = z.object({
  id: z.string(),
  nodeIds: z.array(z.string()).min(2),
  access: z.enum(['paid', 'unpaid']),
  direction: z.enum(['both', 'forward']),
  length: z.number().nonnegative(),
  seconds: z.number().nonnegative(),
})
export const sourceGraphSchema = z.object({
  schemaVersion: z.literal(1),
  code: z.string(),
  venueId: z.string(),
  nodes: z.array(nodeSchema).max(100000),
  edges: z.array(edgeSchema).max(100000),
  places: z.array(
    z.object({
      id: z.string(),
      unitId: z.string().optional(),
      levelId: z.string(),
      nodeIds: z.array(z.string()),
    }),
  ),
})
export type SourceGraph = z.infer<typeof sourceGraphSchema>
export type PaidPolicy = 'unpaid-only' | 'prefer-unpaid' | 'paid-allowed'
type SourceRoute = {
  nodes: SourceGraph['nodes']
  metres: number
  seconds: number
  requiresPaidAccess: boolean
  connectionIds: string[]
}
type Arc = {
  to: string
  seconds: number
  metres: number
  paid: boolean
  edgeId: string
}

/** Binary minimum queue keeps search proportional to network edges rather than floor area. */
class Queue {
  private items: [number, string][] = []
  push(value: [number, string]): void {
    let i = this.items.push(value) - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.items[parent][0] <= value[0]) break
      this.items[i] = this.items[parent]
      i = parent
    }
    this.items[i] = value
  }
  pop(): [number, string] | undefined {
    const first = this.items[0],
      last = this.items.pop()
    if (!first || !last || !this.items.length) return first
    let i = 0
    while (i * 2 + 1 < this.items.length) {
      let child = i * 2 + 1
      if (
        child + 1 < this.items.length &&
        this.items[child + 1][0] < this.items[child][0]
      )
        child++
      if (last[0] <= this.items[child][0]) break
      this.items[i] = this.items[child]
      i = child
    }
    this.items[i] = last
    return first
  }
}

/** Route only along published source segments, with an explicit paid-area policy.
 * @param graph Validated government station network.
 * @param origins Source access nodes for the origin room or entry.
 * @param destinations Source access nodes for the destination room.
 * @param policy Strict exclusion, unpaid-first, or paid-allowed.
 * @returns The fastest estimated source path, or null for a disconnected pair.
 * @remarks No nearest-point links, wall-crossing shortcuts or inter-floor links are invented.
 */
export function routeSourceGraph(
  graph: SourceGraph,
  origins: string[],
  destinations: string[],
  policy: PaidPolicy = 'prefer-unpaid',
): SourceRoute | null {
  const nodes = new Map(graph.nodes.map(n => [n.id, n]))
  const adjacency = new Map<string, Arc[]>()
  for (const edge of graph.edges) {
    if (edge.nodeIds.some(id => !nodes.has(id)))
      throw new Error('Incomplete station network')
    const distances = edge.nodeIds.slice(1).map((id, i) => {
      const a = nodes.get(edge.nodeIds[i]),
        b = nodes.get(id)
      if (!a || !b) throw new Error('Incomplete station network')
      return Math.hypot(
        (a.point[0] - b.point[0]) * 111320 * Math.cos((a.point[1] * Math.PI) / 180),
        (a.point[1] - b.point[1]) * 111320,
        a.z - b.z,
      )
    })
    const total = distances.reduce((sum, v) => sum + v, 0)
    edge.nodeIds.slice(1).forEach((id, i) => {
      const from = edge.nodeIds[i]
      const ratio = total ? distances[i] / total : 1 / distances.length
      const arc = {
        to: id,
        seconds: edge.seconds * ratio,
        metres: edge.length * ratio,
        paid: edge.access === 'paid',
        edgeId: edge.id,
      }
      adjacency.set(from, [...(adjacency.get(from) ?? []), arc])
      if (edge.direction === 'both')
        adjacency.set(id, [...(adjacency.get(id) ?? []), { ...arc, to: from }])
    })
  }
  const targets = new Set(destinations.filter(id => nodes.has(id)))
  const search = (allowPaid: boolean): SourceRoute | null => {
    const queue = new Queue(),
      costs = new Map<string, number>(),
      previous = new Map<string, { from: string; arc: Arc }>()
    for (const id of origins)
      if (nodes.has(id)) {
        costs.set(id, 0)
        queue.push([0, id])
      }
    while (true) {
      const next = queue.pop()
      if (!next) break
      const [cost, id] = next
      if (cost !== costs.get(id)) continue
      if (targets.has(id)) {
        const chain = [id],
          arcs: Arc[] = []
        let cursor = id
        while (previous.has(cursor)) {
          const step = previous.get(cursor)
          if (!step) break
          arcs.push(step.arc)
          chain.push(step.from)
          cursor = step.from
        }
        return {
          nodes: chain.reverse().map(key => {
            const node = nodes.get(key)
            if (!node) throw new Error('Incomplete station network')
            return node
          }),
          metres: arcs.reduce((sum, arc) => sum + arc.metres, 0),
          seconds: cost,
          requiresPaidAccess: arcs.some(arc => arc.paid),
          connectionIds: [...new Set(arcs.reverse().map(arc => arc.edgeId))],
        }
      }
      for (const arc of adjacency.get(id) ?? []) {
        if (!allowPaid && arc.paid) continue
        const candidate = cost + arc.seconds
        if (candidate < (costs.get(arc.to) ?? Infinity)) {
          costs.set(arc.to, candidate)
          previous.set(arc.to, { from: id, arc })
          queue.push([candidate, arc.to])
        }
      }
    }
    return null
  }
  return policy === 'paid-allowed'
    ? search(true)
    : (search(false) ?? (policy === 'prefer-unpaid' ? search(true) : null))
}

const cache = new Map<string, Promise<SourceGraph>>()
/** Load an immutable optional station network and retry failed retrievals.
 * @param code Official station code. @returns Validated source network.
 */
export async function loadStationNetwork(code: string): Promise<SourceGraph> {
  if (!/^[A-Z]{3}$/.test(code)) throw new Error('Invalid station code')
  let pending = cache.get(code)
  if (!pending) {
    pending = (async () => {
      const response = await fetch(
        `https://tiles.saanseoi.hk/routing/hk/indoor/2026-11-16/stations/${code}.json`,
        { signal: AbortSignal.timeout(15000) },
      )
      if (!response.ok) throw new Error('Station network is unavailable')
      const graph = sourceGraphSchema.parse(await response.json())
      if (graph.code !== code) throw new Error('Station network identity mismatch')
      return graph
    })()
    cache.set(code, pending)
    pending.catch(() => cache.delete(code))
  }
  return pending
}

/** Adapt a source-network route to the shared indoor journey renderer.
 * @param graph Published station network. @param data Visible map snapshot.
 * @param entrance Source entry. @param target Source destination.
 * @param policy Paid-area policy. @returns A route or null when access or floor mapping is incomplete.
 */
export function findSourceIndoorRoute(
  graph: SourceGraph,
  data: IndoorData,
  entrance: IndoorFeature,
  target: Place,
  policy: PaidPolicy = 'prefer-unpaid',
): IndoorRoute | null {
  if (graph.venueId !== data.venue_polygon.features[0].properties.venue_id)
    throw new Error('Station network does not match the map')
  const originUnit = data.unit_polygon.features.find(
    feature => feature.properties.unit_id === entrance.properties.unit_id,
  )
  const paidEndpoint =
    target.area === 'Paid area' ||
    originUnit?.properties.section_name_en === 'Paid area'
  if (policy === 'unpaid-only' && paidEndpoint) return null
  const origins = graph.places
    .filter(p => p.id === entrance.properties.amenity_id)
    .flatMap(p => p.nodeIds)
  const destinations = graph.places
    .filter(p => p.id === target.id || p.unitId === target.id)
    .flatMap(p => p.nodeIds)
  const route = routeSourceGraph(graph, origins, destinations, policy)
  if (!route) return null
  const levels = new Set(
    data.level_polygon.features.map(f => String(f.properties.level_id)),
  )
  // Vertical connector interior vertices have no planar floor: retain their boundary vertices instead.
  if (
    route.nodes.some(
      (node, index) =>
        !node.floorIds.some(id => levels.has(id)) &&
        index > 0 &&
        index < route.nodes.length - 1 &&
        Math.abs(route.nodes[index - 1].z - node.z) < 0.25 &&
        Math.abs(route.nodes[index + 1].z - node.z) < 0.25,
    )
  )
    return null
  const points = route.nodes.flatMap(node => {
    const level = node.floorIds.find(id => levels.has(id))
    return level ? [{ point: node.point, level }] : []
  })
  if (
    points.length < 2 ||
    !route.nodes[0].floorIds.some(id => levels.has(id)) ||
    !route.nodes.at(-1)?.floorIds.some(id => levels.has(id))
  )
    return null
  return {
    points,
    metres: route.metres,
    estimatedSeconds: route.seconds,
    provider: 'landsd-network',
    requiresPaidAccess: route.requiresPaidAccess || paidEndpoint,
    connectionIds: route.connectionIds,
    entrance: String(entrance.properties.amenity_name_en),
    destination: `${target.name.en} ${target.code}`.trim(),
    targetId: target.id,
  }
}
