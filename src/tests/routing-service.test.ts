import { describe, expect, it, vi } from 'vitest'
import { requestRouting, toJourney } from '#lib/api/services/routing.js'

const payload = (ferry = false) => ({
  native: {
    trip: {
      status: 0,
      units: 'kilometers',
      summary: { time: 842.895, length: 1.188, has_ferry: ferry },
      legs: [
        {
          shape: '_izlhA~rlgdF_{geC~ywl@_kwzCn`{nI',
          maneuvers: [
            {
              instruction: 'Walk along the street.',
              time: 840,
              length: 1.18,
              begin_shape_index: 0,
              end_shape_index: 2,
            },
          ],
        },
        {
          shape: '_izlhA~rlgdF_{geC~ywl@',
          maneuvers: [
            {
              instruction: 'You have arrived.',
              time: 0,
              length: 0,
              begin_shape_index: 1,
              end_shape_index: 1,
            },
          ],
        },
      ],
    },
  },
})

describe('routing service contract', () => {
  it('converts kilometres to metres, preserves all ordered steps and does not treat optimization cost as money', () => {
    const route = toJourney(payload(), 'pedestrian')
    expect(route).toMatchObject({
      seconds: 842.895,
      metres: 1188,
      cost: { currency: 'HKD', amount: 0 },
    })
    expect(route.segments.map(step => step.instruction)).toEqual([
      'Walk along the street.',
      'You have arrived.',
    ])
    expect(route.segments[0].metres).toBe(1180)
    expect(route.segments[0].geometry).toEqual({
      type: 'LineString',
      coordinates: route.geometry.coordinates[0],
    })
    expect(route.segments[1].geometry).toEqual({
      type: 'Point',
      coordinates: [-120.95, 40.7],
    })
    expect(route.geometry).toEqual({
      type: 'MultiLineString',
      coordinates: [
        [
          [-120.2, 38.5],
          [-120.95, 40.7],
          [-126.453, 43.252],
        ],
        [
          [-120.2, 38.5],
          [-120.95, 40.7],
        ],
      ],
    })
    expect(toJourney(payload(), 'auto').cost.amount).toBeNull()
    expect(toJourney(payload(true), 'pedestrian').cost.amount).toBeNull()
  })

  it('uses inclusive leg-local maneuver ranges and rejects invalid indices', () => {
    const valid = payload()
    valid.native.trip.legs[0].maneuvers[0].begin_shape_index = 1
    expect(toJourney(valid, 'pedestrian').segments[0].geometry.coordinates).toEqual([
      [-120.95, 40.7],
      [-126.453, 43.252],
    ])
    for (const [begin, end] of [
      [2, 1],
      [0, 3],
      [-1, 1],
      [0, 1.5],
    ]) {
      const invalid = payload()
      Object.assign(invalid.native.trip.legs[0].maneuvers[0], {
        begin_shape_index: begin,
        end_shape_index: end,
      })
      expect(() => toJourney(invalid, 'pedestrian')).toThrow()
    }
  })

  it('rejects invalid or unsupported-unit upstream responses', () => {
    expect(() => toJourney({ native: { trip: { status: 0 } } }, 'auto')).toThrow()
    const invalid = payload()
    invalid.native.trip.units = 'miles'
    expect(() => toJourney(invalid, 'auto')).toThrow()
    const malformed = payload()
    malformed.native.trip.legs[0].shape = '_'
    expect(() => toJourney(malformed, 'auto')).toThrow()
  })

  it('forwards only supported route fields using the server-side binding and bearer credential', async () => {
    const fetch = vi.fn(async () => Response.json(payload()))
    const env = {
      ROUTING_SERVICE: { fetch },
      ROUTING_TOKEN: 'test-only-secret',
    } as unknown as App.Platform['env']
    await requestRouting(env, '/route', {
      origin: { lat: 22.28, lon: 114.15 },
      destination: { lat: 22.29, lon: 114.16 },
      mode: 'pedestrian',
    })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://routing.internal/route')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-only-secret' })
    expect(JSON.parse(init.body as string)).toEqual({
      locations: [
        { lat: 22.28, lon: 114.15 },
        { lat: 22.29, lon: 114.16 },
      ],
      costing: 'pedestrian',
    })
  })

  it('distinguishes an unreachable route from an unavailable engine', async () => {
    for (const [upstream, expected] of [
      [400, 404],
      [502, 503],
    ]) {
      const env = {
        ROUTING_SERVICE: {
          fetch: async () => new Response('{}', { status: upstream }),
        },
        ROUTING_TOKEN: 'test-only-secret',
      } as unknown as App.Platform['env']
      await expect(requestRouting(env, '/route')).rejects.toMatchObject({
        status: expected,
      })
    }
  })
})
