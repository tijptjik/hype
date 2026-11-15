import { describe, expect, it, vi } from 'vitest'
import { intersects } from '../lib/indoor/navigation/geometry'
import { FloorRepository } from '../lib/indoor/navigation/floors'
import { IndoorRouter } from '../lib/indoor/navigation/router'
import type {
  NavigationArea,
  NavigationConnection,
  NavigationFloor,
} from '../lib/indoor/navigation/types'

const area = (
  id: string,
  x: number,
  y: number,
  width = 3,
  height = 3,
  access: NavigationArea['access'] = 'unpaid',
): NavigationArea => ({
  id,
  access,
  transit: true,
  geometry: {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [x, y],
          [x + width, y],
          [x + width, y + height],
          [x, y + height],
          [x, y],
        ],
      ],
    },
  },
})
const floor = (id: string, areas: NavigationArea[]): NavigationFloor => ({
  id,
  name: id,
  elevation: 0,
  areas,
  accessPoints: [],
  barriers: [],
})
function connect(
  a: NavigationFloor,
  areaA: string,
  pointA: [number, number],
  b: NavigationFloor,
  areaB: string,
  pointB: [number, number],
  id: string,
  kind: NavigationConnection['kind'] = 'passage',
): NavigationConnection {
  a.accessPoints.push({ id: `${id}:a`, areaId: areaA, point: pointA })
  b.accessPoints.push({ id: `${id}:b`, areaId: areaB, point: pointB })
  return {
    id,
    from: { floorId: a.id, accessPointId: `${id}:a` },
    to: { floorId: b.id, accessPointId: `${id}:b` },
    kind,
    direction: 'both',
    enabled: true,
    evidence: 'reviewed-layout',
    sourceIds: [id],
  }
}
function router(
  floors: NavigationFloor[],
  connections: NavigationConnection[] = [],
): IndoorRouter {
  return new IndoorRouter(
    new FloorRepository(
      floors.map(f => f.id),
      async id => {
        const result = floors.find(f => f.id === id)
        if (!result) throw new Error('Missing floor')
        return result
      },
    ),
    connections,
  )
}
function fareNetwork() {
  const f = floor('main', [
    area('start', 0, 0),
    area('paid', 4, 0, 3, 3, 'paid'),
    area('end', 8, 0),
    area('detour', 0, 10, 11),
  ])
  const gates = [
    connect(f, 'start', [2.25, 1.5], f, 'paid', [4.5, 1.5], 'in', 'faregate'),
    connect(f, 'paid', [6, 1.5], f, 'end', [8.25, 1.5], 'out', 'faregate'),
  ]
  const detour = [
    connect(f, 'start', [1.5, 2.25], f, 'detour', [1.5, 10.5], 'up'),
    connect(f, 'detour', [9, 10.5], f, 'end', [9, 2.25], 'down'),
  ]
  const start = { floorId: 'main', point: [1.5, 1.5] as [number, number] },
    end = { floorId: 'main', point: [9, 1.5] as [number, number] }
  return { f, gates, detour, start, end }
}

describe('independent indoor navigation', () => {
  it('always chooses an available unpaid route despite a much shorter paid shortcut', async () => {
    const { f, gates, detour, start, end } = fareNetwork()
    const result = await router([f], [...gates, ...detour]).route(start, end)
    expect(result?.requiresPaidAccess).toBe(false)
    expect(result?.connectionIds).toEqual(['up', 'down'])
    expect(result?.metres).toBeGreaterThan(20)
  })
  it('uses explicit fare gates only as fallback, reports paid access, and respects direction and closure', async () => {
    const { f, gates, start, end } = fareNetwork()
    const result = await router([f], gates).route(start, end)
    expect(result?.requiresPaidAccess).toBe(true)
    expect(result?.connectionIds).toEqual(['in', 'out'])
    expect(result?.points[0].point).toEqual(start.point)
    expect(result?.points.at(-1)?.point).toEqual(end.point)
    expect(
      await router(
        [f],
        gates.map(g => ({ ...g, kind: 'door' })),
      ).route(start, end),
    ).toBeNull()
    expect(
      await router(
        [f],
        gates.map(g => ({ ...g, enabled: false })),
      ).route(start, end),
    ).toBeNull()
    expect(
      await router(
        [f],
        gates.map(g => ({ ...g, direction: 'forward' })),
      ).route(end, start),
    ).toBeNull()
    expect(
      (await router([f], gates).route(start, { floorId: 'main', point: [5, 1.5] }))
        ?.requiresPaidAccess,
    ).toBe(true)
  })
  it('does not cross touching area boundaries without an explicit connection', async () => {
    const f = floor('f', [area('a', 0, 0), area('b', 3, 0)])
    expect(
      await router([f]).route(
        { floorId: 'f', point: [1, 1] },
        { floorId: 'f', point: [4, 1] },
      ),
    ).toBeNull()
  })
  it('respects solid barriers even when both endpoints or a declared connection are nearby', async () => {
    const f = floor('f', [area('a', 0, 0, 6)])
    f.barriers.push({ id: 'wall', from: [3, -1], to: [3, 4] })
    const c = connect(f, 'a', [2.8, 1.5], f, 'a', [3.2, 1.5], 'invalid-door', 'door')
    expect(
      await router([f], [c]).route(
        { floorId: 'f', point: [2.8, 1.5] },
        { floorId: 'f', point: [3.2, 1.5] },
      ),
    ).toBeNull()
  })
  it('does not jump through a thin polygon hole smaller than the grid spacing', async () => {
    const a = area('a', 0, 0, 6)
    if (a.geometry.geometry.type !== 'Polygon') throw new Error('Expected polygon')
    a.geometry.geometry.coordinates.push([
      [2.95, -0.1],
      [3.05, -0.1],
      [3.05, 3.1],
      [2.95, 3.1],
      [2.95, -0.1],
    ])
    expect(
      await router([floor('f', [a])]).route(
        { floorId: 'f', point: [1, 1] },
        { floorId: 'f', point: [4, 1] },
      ),
    ).toBeNull()
  })
  it('finds a reachable destination interior without using its empty bounding-box centre', async () => {
    const a = area('a', 0, 0, 6, 6)
    if (a.geometry.geometry.type !== 'Polygon') throw new Error('Expected polygon')
    a.geometry.geometry.coordinates.push([
      [2, 2],
      [4, 2],
      [4, 4],
      [2, 4],
      [2, 2],
    ])
    const result = await router([floor('f', [a])]).route(
      { floorId: 'f', point: [1, 1] },
      { floorId: 'f', areaId: 'a' },
    )
    expect(result).not.toBeNull()
    expect(
      await router([floor('f', [a])]).route(
        { floorId: 'f', point: [1, 1] },
        { floorId: 'f', point: [3, 3] },
      ),
    ).toBeNull()
  })
  it('does not route through unknown access or use destination rooms as shortcuts', async () => {
    const { f, gates, start, end } = fareNetwork()
    const paidArea = f.areas.find(a => a.id === 'paid')
    if (!paidArea) throw new Error('Missing paid fixture')
    paidArea.access = 'unknown'
    expect(await router([f], gates).route(start, end)).toBeNull()
    paidArea.access = 'paid'
    paidArea.transit = false
    expect(await router([f], gates).route(start, end)).toBeNull()
  })
  it('joins independent floors only through enabled evidence and never loads unrelated floors', async () => {
    const a = floor('a', [area('room', 0, 0)]),
      b = floor('b', [area('room', 0, 0)]),
      c = floor('unrelated', [area('room', 0, 0)])
    b.elevation = 8
    const link = connect(a, 'room', [1.5, 1.5], b, 'room', [1.5, 1.5], 'lift', 'lift')
    const loader = vi.fn(async (id: string) => {
      const result = [a, b, c].find(f => f.id === id)
      if (!result) throw new Error('Missing floor')
      return result
    })
    const repository = new FloorRepository(['a', 'b', 'unrelated'], loader),
      engine = new IndoorRouter(repository, [link])
    const start = { floorId: 'a', point: [1, 1] as [number, number] },
      end = { floorId: 'b', point: [2, 2] as [number, number] }
    const first = await engine.route(start, end)
    expect(first?.connectionIds).toEqual(['lift'])
    expect(first?.metres).toBeGreaterThanOrEqual(8)
    await engine.route(start, end)
    expect(loader.mock.calls.map(c => c[0]).sort()).toEqual(['a', 'b'])
    expect(
      await router([a, b], [{ ...link, evidence: 'candidate' }]).route(start, end),
    ).toBeNull()
  })
  it('deduplicates floor loading and allows retry after a failed load', async () => {
    let attempts = 0
    const f = floor('f', []),
      repo = new FloorRepository(['f'], async () => {
        if (attempts++ === 0) throw new Error('offline')
        return f
      })
    const one = repo.load('f'),
      two = repo.load('f')
    expect(one).toBe(two)
    await expect(one).rejects.toThrow('offline')
    expect(await repo.load('f')).toBe(f)
    await expect(repo.load('missing')).rejects.toThrow('Unknown floor')
  })
})

describe('route smoothing and preferred wall clearance', () => {
  it('reduces an unobstructed diagonal to its endpoints and reports geometric metres', async () => {
    const f = floor('open', [area('hall', 0, 0, 30, 20)])
    const result = await router([f]).route(
      { floorId: f.id, point: [4, 4] },
      { floorId: f.id, point: [25, 15] },
    )
    expect(result?.points.map(p => p.point)).toEqual([
      [4, 4],
      [25, 15],
    ])
    expect(result?.metres).toBeCloseTo(Math.hypot(21, 11), 8)
  })

  it('moves into the three-metre interior instead of following a nearby wall', async () => {
    const f = floor('wide', [area('hall', 0, 0, 36, 12)])
    const result = await router([f]).route(
      { floorId: f.id, point: [3, 0.75] },
      { floorId: f.id, point: [33, 0.75] },
    )
    expect(result).not.toBeNull()
    if (!result) throw new Error('Missing route')
    expect(result.points.some(p => p.point[1] >= 3)).toBe(true)
    expect(result.points.length).toBeLessThan(20)
    expect(result.points[0].point).toEqual([3, 0.75])
    expect(result.points.at(-1)?.point).toEqual([33, 0.75])
  })

  it('keeps a corridor narrower than six metres reachable and straight', async () => {
    const f = floor('narrow', [area('hall', 0, 0, 20, 3)])
    const result = await router([f]).route(
      { floorId: f.id, point: [1.5, 1.5] },
      { floorId: f.id, point: [18, 1.5] },
    )
    expect(result?.points.map(p => p.point)).toEqual([
      [1.5, 1.5],
      [18, 1.5],
    ])
    expect(result?.metres).toBeCloseTo(16.5, 8)
  })

  it('never straightens through a thin solid barrier', async () => {
    const f = floor('barrier', [area('hall', 0, 0, 24, 20)])
    f.barriers.push({ id: 'wall', from: [12, 0], to: [12, 12] })
    const result = await router([f]).route(
      { floorId: f.id, point: [4, 6] },
      { floorId: f.id, point: [20, 6] },
    )
    expect(result).not.toBeNull()
    if (!result) throw new Error('Missing route')
    for (let i = 1; i < result.points.length; i++) {
      expect(
        intersects(
          result.points[i - 1].point,
          result.points[i].point,
          [12, 0],
          [12, 12],
        ),
      ).toBe(false)
    }
  })
})
