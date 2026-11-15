// MODEL
import { bounds } from '../model'
import { areaClearance, type Clearance } from './clearance'
import type { FloorRepository } from './floors'
import { contains, distance, insideSegment, intersects, type Point } from './geometry'
import type {
  NavigationArea,
  NavigationConnection,
  NavigationFloor,
  NavigationRoute,
  RouteEndpoint,
} from './types'

// TOC: Floor graph compilation | Endpoint attachment | Unpaid-first search

type Edge = { to: number; cost: number; connectionId?: string }
type Node = {
  point: Point
  floorId: string
  area: NavigationArea
  edges: Edge[]
  clearance: number
}
type FloorGraph = {
  floor: NavigationFloor
  nodes: Node[]
  access: Map<string, number>
  margins: Map<string, Clearance>
}
const step = 0.75

/** Tests solid barriers independently of the area's outline. @param floor Floor module. @param a Start. @param b End. @returns Whether no barrier is touched. */
function clear(floor: NavigationFloor, a: Point, b: Point): boolean {
  return !floor.barriers.some(wall => intersects(a, b, wall.from, wall.to))
}
/** Compiles one floor once; neighbouring areas remain disconnected until a declared connection joins them. @param floor Independent floor. @returns Cached planar graph. */
function compile(floor: NavigationFloor): FloorGraph {
  const nodes: Node[] = [],
    access = new Map<string, number>(),
    margins = new Map<string, Clearance>()
  for (const area of floor.areas) {
    const margin = areaClearance(floor, area)
    margins.set(area.id, margin)
    const [x0, y0, x1, y1] = bounds(area.geometry),
      index = new Map<string, number>()
    const first = nodes.length
    for (let x = Math.floor(x0 / step); x <= Math.ceil(x1 / step); x++) {
      for (let y = Math.floor(y0 / step); y <= Math.ceil(y1 / step); y++) {
        const point: Point = [x * step, y * step]
        if (!contains(point, area.geometry)) continue
        index.set(`${x}:${y}`, nodes.length)
        nodes.push({
          point,
          floorId: floor.id,
          area,
          edges: [],
          clearance: margin.at(point),
        })
      }
    }
    for (let i = first; i < nodes.length; i++) {
      const node = nodes[i],
        x = Math.round(node.point[0] / step),
        y = Math.round(node.point[1] / step)
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1],
      ]) {
        const j = index.get(`${x + dx}:${y + dy}`)
        if (
          j === undefined ||
          !insideSegment(node.point, nodes[j].point, area.geometry) ||
          !clear(floor, node.point, nodes[j].point)
        )
          continue
        const cost =
          (distance(node.point, nodes[j].point) *
            (margin.weight(node.clearance) + margin.weight(nodes[j].clearance))) /
          2
        node.edges.push({ to: j, cost })
        nodes[j].edges.push({ to: i, cost })
      }
    }
    for (const port of floor.accessPoints.filter(p => p.areaId === area.id)) {
      if (!contains(port.point, area.geometry)) continue
      const neighbours: Edge[] = []
      for (let i = first; i < nodes.length; i++) {
        const n = nodes[i],
          cost = distance(port.point, n.point)
        if (
          cost <= 2 &&
          insideSegment(port.point, n.point, area.geometry) &&
          clear(floor, port.point, n.point)
        )
          neighbours.push({ to: i, cost: margin.cost(port.point, n.point) })
      }
      if (!neighbours.length) continue
      const id = nodes.length
      for (const edge of neighbours)
        nodes[edge.to].edges.push({ to: id, cost: edge.cost })
      nodes.push({
        point: port.point,
        floorId: floor.id,
        area,
        edges: neighbours,
        clearance: margin.at(port.point),
      })
      access.set(port.id, id)
    }
  }
  return { floor, nodes, access, margins }
}

/** Reusable router; caches per-floor graphs, and never routes on display-only candidates. */
export class IndoorRouter {
  private graphs = new Map<string, Promise<FloorGraph>>()
  constructor(
    readonly floors: FloorRepository,
    readonly connections: readonly NavigationConnection[],
  ) {}
  /** Loads and compiles one floor. @param id Floor identity. @returns Reusable graph. */
  private graph(id: string): Promise<FloorGraph> {
    const cached = this.graphs.get(id)
    if (cached) return cached
    const pending = this.floors
      .load(id)
      .then(compile)
      .catch(error => {
        this.graphs.delete(id)
        throw error
      })
    this.graphs.set(id, pending)
    return pending
  }
  /** Finds a route, trying unpaid-only before paid access. @param start Origin point or area. @param end Destination point or area. @returns Route, or null when no evidenced path exists. @remarks Unknown access is excluded. Area destinations select a reachable interior point; points never snap across barriers. */
  async route(
    start: RouteEndpoint,
    end: RouteEndpoint,
  ): Promise<NavigationRoute | null> {
    if (
      !this.floors.ids.includes(start.floorId) ||
      !this.floors.ids.includes(end.floorId)
    )
      return null
    // Load only floors reachable through declared, enabled connections.
    const reachable = new Set([start.floorId])
    let changed = true
    while (changed) {
      changed = false
      for (const c of this.connections) {
        if (!c.enabled || c.evidence === 'candidate') continue
        if (reachable.has(c.from.floorId) && !reachable.has(c.to.floorId)) {
          reachable.add(c.to.floorId)
          changed = true
        }
        if (
          c.direction === 'both' &&
          reachable.has(c.to.floorId) &&
          !reachable.has(c.from.floorId)
        ) {
          reachable.add(c.from.floorId)
          changed = true
        }
      }
    }
    if (!reachable.has(end.floorId)) return null
    const graphs = await Promise.all(
      [...reachable]
        .filter(id => this.floors.ids.includes(id))
        .map(id => this.graph(id)),
    )
    const nodes: Node[] = [],
      ports = new Map<string, number>(),
      floorMap = new Map(graphs.map(g => [g.floor.id, g.floor])),
      margins = new Map(graphs.map(g => [g.floor.id, g.margins]))
    for (const graph of graphs) {
      const offset = nodes.length
      nodes.push(
        ...graph.nodes.map(n => ({
          ...n,
          edges: n.edges.map(e => ({ ...e, to: e.to + offset })),
        })),
      )
      for (const [id, index] of graph.access)
        ports.set(`${graph.floor.id}:${id}`, index + offset)
    }
    for (const c of this.connections) {
      if (!c.enabled || c.evidence === 'candidate') continue
      const a = ports.get(`${c.from.floorId}:${c.from.accessPointId}`),
        b = ports.get(`${c.to.floorId}:${c.to.accessPointId}`)
      if (a === undefined || b === undefined) continue
      const from = nodes[a],
        to = nodes[b]
      // A change of fare zone is legal only through an explicit fare gate.
      if (from.area.access !== to.area.access && c.kind !== 'faregate') continue
      const floor = floorMap.get(from.floorId),
        other = floorMap.get(to.floorId)
      if (!floor || !other) continue
      if (from.floorId === to.floorId && !clear(floor, from.point, to.point)) continue
      const cost = Math.hypot(
        distance(from.point, to.point),
        floor.elevation - other.elevation,
      )
      from.edges.push({ to: b, cost, connectionId: c.id })
      if (c.direction === 'both') to.edges.push({ to: a, cost, connectionId: c.id })
    }
    const attach = (endpoint: RouteEndpoint): number[] => {
      const floor = floorMap.get(endpoint.floorId)
      if (!floor) return []
      const matching = nodes.flatMap((n, i) =>
        n.floorId === endpoint.floorId &&
        (!endpoint.areaId || n.area.id === endpoint.areaId)
          ? [i]
          : [],
      )
      if (!endpoint.point) return endpoint.areaId ? matching : []
      const point = endpoint.point
      const candidates = matching.filter(
        i =>
          distance(point, nodes[i].point) <= 2 &&
          insideSegment(point, nodes[i].point, nodes[i].area.geometry) &&
          clear(floor, point, nodes[i].point),
      )
      if (!candidates.length) return []
      const id = nodes.length,
        area = nodes[candidates[0]].area,
        margin = margins.get(floor.id)?.get(area.id)
      if (!margin) return []
      nodes.push({
        point,
        floorId: floor.id,
        area,
        edges: [],
        clearance: margin.at(point),
      })
      for (const i of candidates.filter(i => nodes[i].area.id === area.id)) {
        const cost = margin.cost(point, nodes[i].point)
        nodes[id].edges.push({ to: i, cost })
        nodes[i].edges.push({ to: id, cost })
      }
      return [id]
    }
    const starts = attach(start),
      ends = new Set(attach(end))
    if (!starts.length || !ends.size) return null
    const terminalAreas = new Set(
      [...starts, ...ends].map(i => `${nodes[i].floorId}:${nodes[i].area.id}`),
    )
    const search = (paid: boolean): NavigationRoute | null => {
      const allowed = (id: number): boolean => {
        const n = nodes[id]
        return (
          n.area.access !== 'unknown' &&
          (paid || n.area.access === 'unpaid') &&
          (n.area.transit || terminalAreas.has(`${n.floorId}:${n.area.id}`))
        )
      }
      const costs = new Float64Array(nodes.length).fill(Infinity),
        previous = new Int32Array(nodes.length).fill(-1),
        links = new Map<number, string>(),
        heap: [number, number][] = []
      const push = (item: [number, number]): void => {
        heap.push(item)
        let i = heap.length - 1
        while (i > 0) {
          const p = (i - 1) >> 1
          if (heap[p][0] <= item[0]) break
          heap[i] = heap[p]
          i = p
        }
        heap[i] = item
      }
      const pop = (): [number, number] => {
        const first = heap[0],
          last = heap.pop() ?? first
        if (heap.length) {
          let i = 0
          while (i * 2 + 1 < heap.length) {
            let c = i * 2 + 1
            if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++
            if (last[0] <= heap[c][0]) break
            heap[i] = heap[c]
            i = c
          }
          heap[i] = last
        }
        return first
      }
      for (const id of starts.filter(allowed)) {
        costs[id] = 0
        push([0, id])
      }
      while (heap.length) {
        const [cost, id] = pop()
        if (cost !== costs[id]) continue
        if (ends.has(id)) {
          const chain: number[] = []
          for (let i = id; i !== -1; i = previous[i]) chain.unshift(i)
          // Pull straight, visible strings within each area; declared connection endpoints stay fixed.
          const simplified = [chain[0]]
          let anchor = 0
          while (anchor < chain.length - 1) {
            let limit = anchor + 1
            while (
              limit < chain.length &&
              !links.has(chain[limit]) &&
              nodes[chain[limit]].floorId === nodes[chain[anchor]].floorId &&
              nodes[chain[limit]].area.id === nodes[chain[anchor]].area.id
            )
              limit++
            let next = anchor + 1
            const a = nodes[chain[anchor]],
              floor = floorMap.get(a.floorId),
              margin = margins.get(a.floorId)?.get(a.area.id)
            if (!floor || !margin) throw new Error('Missing compiled navigation area')
            for (let candidate = limit - 1; candidate > anchor + 1; candidate--) {
              const b = nodes[chain[candidate]]
              if (
                insideSegment(a.point, b.point, a.area.geometry) &&
                clear(floor, a.point, b.point) &&
                margin.along(a.point, b.point) + 1e-9 >=
                  Math.min(a.clearance, b.clearance) &&
                margin.cost(a.point, b.point) <=
                  (costs[chain[candidate]] - costs[chain[anchor]]) * 1.001
              ) {
                next = candidate
                break
              }
            }
            simplified.push(chain[next])
            anchor = next
          }
          // Report the actual smoothed walking distance, never the clearance penalty used by search.
          const metres = simplified.slice(1).reduce((sum, index, i) => {
            const a = nodes[simplified[i]],
              b = nodes[index],
              from = floorMap.get(a.floorId),
              to = floorMap.get(b.floorId)
            if (!from || !to) throw new Error('Missing compiled navigation floor')
            return (
              sum +
              Math.hypot(distance(a.point, b.point), from.elevation - to.elevation)
            )
          }, 0)
          return {
            points: simplified.map(i => ({
              point: nodes[i].point,
              floorId: nodes[i].floorId,
            })),
            metres,
            requiresPaidAccess: chain.some(i => nodes[i].area.access === 'paid'),
            connectionIds: chain.flatMap(i =>
              links.has(i) ? [links.get(i) as string] : [],
            ),
          }
        }
        for (const edge of nodes[id].edges) {
          if (!allowed(edge.to)) continue
          const next = cost + edge.cost
          if (next < costs[edge.to]) {
            costs[edge.to] = next
            previous[edge.to] = id
            if (edge.connectionId) links.set(edge.to, edge.connectionId)
            else links.delete(edge.to)
            push([next, edge.to])
          }
        }
      }
      return null
    }
    return search(false) ?? search(true)
  }
}
