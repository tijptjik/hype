import {
  collection,
  type IndoorData,
  type IndoorFeature,
  type Place,
} from '../lib/indoor/model'
import { describe, expect, it } from 'vitest'
import {
  findSourceIndoorRoute,
  routeSourceGraph,
  sourceGraphSchema,
  type SourceGraph,
} from '../lib/indoor/navigation/sourceGraph'

function graph(): SourceGraph {
  return {
    schemaVersion: 1,
    code: 'KOT',
    venueId: 'station',
    places: [],
    nodes: ['a', 'b', 'c', 'd'].map((id, i) => ({
      id,
      point: [114, 22 + i / 10000],
      z: i === 3 ? 5 : 0,
      floorIds: [i === 3 ? 'upper' : 'lower'],
    })),
    edges: [
      {
        id: 'paid',
        nodeIds: ['a', 'c'],
        access: 'paid',
        direction: 'both',
        length: 10,
        seconds: 5,
      },
      {
        id: 'detour',
        nodeIds: ['a', 'b', 'c'],
        access: 'unpaid',
        direction: 'both',
        length: 30,
        seconds: 20,
      },
      {
        id: 'escalator',
        nodeIds: ['c', 'd'],
        access: 'paid',
        direction: 'forward',
        length: 10,
        seconds: 10,
      },
    ],
  }
}
describe('source station routing', () => {
  it('prefers the unpaid detour even when paid is faster', () => {
    expect(routeSourceGraph(graph(), ['a'], ['c'])?.connectionIds).toEqual(['detour'])
    expect(routeSourceGraph(graph(), ['a'], ['c'], 'paid-allowed')?.seconds).toBe(5)
  })
  it('never relaxes unpaid-only and marks an explicitly permitted fallback', () => {
    expect(routeSourceGraph(graph(), ['a'], ['d'], 'unpaid-only')).toBeNull()
    expect(routeSourceGraph(graph(), ['a'], ['d'])?.requiresPaidAccess).toBe(true)
  })
  it('preserves connector direction and refuses nearby disconnected floors', () => {
    expect(routeSourceGraph(graph(), ['d'], ['a'])).toBeNull()
    const network = graph()
    network.edges.pop()
    network.nodes[3].point = network.nodes[0].point
    expect(routeSourceGraph(network, ['a'], ['d'])).toBeNull()
  })
  it('retains intermediate source vertices instead of cutting across the detour', () => {
    expect(routeSourceGraph(graph(), ['a'], ['c'])?.nodes.map(n => n.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })
  it('rejects malformed weights and incomplete topology', () => {
    const network = graph()
    network.edges[0].seconds = -1
    expect(sourceGraphSchema.safeParse(network).success).toBe(false)
    network.edges[0].seconds = 1
    network.edges[0].nodeIds.push('missing')
    expect(() => routeSourceGraph(network, ['a'], ['c'])).toThrow(
      'Incomplete station network',
    )
  })
})

it('checks paid destination access independently of approach-edge access', () => {
  const feature: IndoorFeature = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [114, 22] },
    properties: {
      venue_id: 'station',
      amenity_id: 'entry',
      unit_id: 'origin',
      level_id: 'lower',
    },
  }
  const data: IndoorData = {
    retrievedAt: 'test',
    venue_polygon: collection([feature]),
    level_polygon: collection([feature]),
    unit_polygon: collection([]),
    opening_line: collection([]),
    amenity_point: collection([feature]),
    occupant_point: collection([]),
  }
  const target: Place = {
    id: 'paid-shop',
    levelId: 'lower',
    name: { en: 'Shop', 'zh-Hant': '' },
    code: '',
    category: 'shop',
    area: 'Paid area',
    feature,
    occupants: [],
    kind: 'shop',
  }
  const network = graph()
  network.places = [
    { id: 'entry', levelId: 'lower', nodeIds: ['a'] },
    { id: 'paid-shop', levelId: 'lower', nodeIds: ['c'] },
  ]
  expect(
    findSourceIndoorRoute(network, data, feature, target, 'unpaid-only'),
  ).toBeNull()
  expect(
    findSourceIndoorRoute(network, data, feature, target)?.requiresPaidAccess,
  ).toBe(true)
})
