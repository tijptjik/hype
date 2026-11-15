import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { layerNames, places, type IndoorData } from '../lib/indoor/model'
import { contains, findIndoorRoute, indoorNavigation } from '../lib/indoor/routing'
import { existsSync } from 'node:fs'

if (existsSync('.research/indoor/kennedy-town/manifest.json')) {
  const data = Object.fromEntries(
    layerNames.map(n => [
      n,
      JSON.parse(readFileSync(`.research/indoor/kennedy-town/${n}.json`, 'utf8')),
    ]),
  ) as IndoorData
  data.connections = JSON.parse(
    readFileSync('.research/indoor/kennedy-town/connections.json', 'utf8'),
  )
  describe('indoor route preview', () => {
    it('connects Exit A to 7-Eleven without using paid space or inferred links', async () => {
      const entrance = data.amenity_point.features.find(
        f =>
          f.properties.amenity_name_en === 'Exit A' && f.properties.level_ordinal === 0,
      )
      if (!entrance) throw new Error('Missing Exit A fixture')
      const targets = places(data).filter(p => p.name.en === '7-Eleven')
      const routes = await Promise.all(
        targets.map(t => findIndoorRoute(data, entrance, t)),
      )
      expect(routes[targets.findIndex(t => t.code === 'KET 3')]).not.toBeNull()
      expect(
        routes.some(Boolean),
        JSON.stringify(targets.map((t, i) => [t.id, routes[i]?.metres])),
      ).toBe(true)
      for (const route of routes.filter(r => r !== null)) {
        expect(route.metres).toBeGreaterThan(10)
        expect(new Set(route.points.map(p => p.level)).size).toBe(2)
        expect(
          route.points.every(p =>
            data.unit_polygon.features.some(
              f =>
                f.properties.level_id === p.level &&
                f.properties.section_name_en === 'Unpaid area' &&
                contains(p.point, f),
            ),
          ),
        ).toBe(true)
      }
    })
    it('does not invent a route to an unmapped floor', async () => {
      const shop = places(data).find(p => p.name.en === '7-Eleven')
      if (!shop) throw new Error('Missing shop fixture')
      const target = {
        ...shop,
        levelId: 'missing',
      }
      expect(
        await findIndoorRoute(data, data.amenity_point.features[0], target),
      ).toBeNull()
    })
  })

  it('respects polygon holes rather than drawing through them', async () => {
    const polygon = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
            [0, 0],
          ],
          [
            [1, 1],
            [3, 1],
            [3, 3],
            [1, 3],
            [1, 1],
          ],
        ],
      },
    }
    expect(contains([0.5, 0.5], polygon)).toBe(true)
    expect(contains([2, 2], polygon)).toBe(false)
    expect(contains([5, 2], polygon)).toBe(false)
  })
  it('returns no route when the evidenced Exit A lift is missing', async () => {
    const entrance = data.amenity_point.features.find(
      f =>
        f.properties.amenity_name_en === 'Exit A' && f.properties.level_ordinal === 0,
    )
    const shop = places(data).find(p => p.code === 'KET 3')
    if (!entrance || !shop) throw new Error('Missing fixture')
    const disconnected = {
      ...data,
      unit_polygon: {
        ...data.unit_polygon,
        features: data.unit_polygon.features.filter(
          f => f.properties.unit_id !== '5dd4916e-4d50-4784-b836-235720e3f59e',
        ),
      },
    }
    expect(await findIndoorRoute(disconnected, entrance, shop)).toBeNull()
  })

  it('exposes the reviewed Exit C stair as stairs, without assuming escalator direction', () => {
    const links = indoorNavigation(data).connections
    expect(
      links.find(c => c.sourceIds.includes('a23543b9-39c6-4e22-8674-25560c8cd40f')),
    ).toMatchObject({
      kind: 'stairs',
      direction: 'both',
      evidence: 'reviewed-layout',
      enabled: true,
    })
    expect(
      links.some(c => c.sourceIds.includes('4f3e948b-a7e6-47b3-8329-57e43a94ef7b')),
    ).toBe(false)
  })

  it('routes Exit C to the unpaid concourse through the reviewed stair', async () => {
    const entrance = data.amenity_point.features.find(
      f => f.properties.amenity_name_en === 'Exit C',
    )
    const target = places(data).find(p => p.code === 'KET 3')
    if (!entrance || !target) throw new Error('Missing Exit C fixture')
    const route = await findIndoorRoute(data, entrance, target)
    expect(route).not.toBeNull()
    expect(route?.requiresPaidAccess).toBe(false)
    expect(route?.connectionIds).toContain(
      'a9f6b2f6-d90b-445a-b113-11da414ee2c7:a23543b9-39c6-4e22-8674-25560c8cd40f',
    )
  })
} else {
  it.skip('requires external indoor archive in .research/indoor', () => {})
}
