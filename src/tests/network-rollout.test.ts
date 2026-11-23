// TEST
import { describe, expect, it } from 'vitest'
// DOMAIN
import {
  collection,
  layerNames,
  type IndoorData,
  type IndoorFeature,
} from '../lib/indoor/model'
import {
  loadNetworkAnnotations,
  networkAnnotation,
  networkConnections,
} from '../lib/indoor/networkAnnotations'
import { networkConnectorLoaders } from '../lib/indoor/network-connectors/loaders'
import manifest from '../lib/indoor/network-connectors/manifest.json'
import { prepareConnectorReliefs } from '../lib/indoor/connectorRelief'
import { stationProjection } from '../lib/indoor/scene'

/** Reconstruct exact guarded inputs from immutable generated source evidence.
 * @param source Station artifact. @returns Isolated map with no authored corrections.
 */
function fixture(
  source: Awaited<ReturnType<typeof networkConnectorLoaders.ADM>>['default'],
): IndoorData {
  const data = Object.fromEntries(
    layerNames.map(name => [name, collection([])]),
  ) as unknown as IndoorData
  data.retrievedAt = '2026-11-16'
  data.connections = []
  data.venue_polygon = collection([
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [114, 22] },
      properties: { venue_id: source.venueId },
    },
  ])
  for (const [id, a] of Object.entries(source.annotations)) {
    const unit: IndoorFeature = {
      type: 'Feature',
      geometry: a.geometry as IndoorFeature['geometry'],
      properties: { unit_id: id, unit_category: a.category, level_id: a.levelId },
    }
    data.unit_polygon.features.push(unit)
    if (!data.level_polygon.features.some(f => f.properties.level_id === a.levelId))
      data.level_polygon.features.push({
        ...unit,
        properties: {
          level_id: a.levelId,
          level_z_value: a.floorZ,
          level_ordinal: a.floorZ,
        },
      })
  }
  return data
}

describe('station-wide source connector rollout', () => {
  for (const [code, loader] of Object.entries(networkConnectorLoaders)) {
    it(`${code}: guards exact sources, preserves corrections and draws exterior footprints only`, async () => {
      const source = (await loader()).default
      const data = fixture(source as Parameters<typeof fixture>[0])
      await loadNetworkAnnotations(data)
      expect(
        data.unit_polygon.features.filter(f => networkAnnotation(data, f)),
      ).toHaveLength(manifest[code as keyof typeof manifest].annotated)
      const pairs = networkConnections(data)
      for (const pair of pairs) {
        expect(pair.evidenceUrl).toBe(source.sourceUrl)
        expect(pair.fromLevel).not.toBe(pair.toLevel)
        expect(pair.direction).toMatch(/^(both|forward)$/)
      }
      const pair = pairs[0]
      if (pair) {
        data.connections = [{ ...pair, enabled: false }]
        expect(networkConnections(data)).not.toContainEqual(pair)
      }
      if (!data.unit_polygon.features.length) return
      const projection = stationProjection(data, false, { bearing: 30, tilt: 55 })
      const reliefs = prepareConnectorReliefs(data)(projection)
      const plan = stationProjection(data, false, { bearing: 30, tilt: 0 })
      const planReliefs = prepareConnectorReliefs(data)(plan)
      expect(reliefs.size).toBe(data.unit_polygon.features.length)
      for (const unit of data.unit_polygon.features) {
        const relief = reliefs.get(String(unit.properties.unit_id))
        expect(relief?.surface).not.toMatch(/NaN|Infinity/)
        if (relief?.exterior) {
          expect(planReliefs.get(String(unit.properties.unit_id))?.surface).toBe(
            plan.path(unit),
          )
          expect(relief.surfaces).toHaveLength(1)
          expect(relief.visibleFaces.join(' ')).not.toMatch(/NaN|Infinity/)
          expect(relief.bridges).toEqual([])
        } else expect(relief?.surface).not.toBe(projection.path(unit))
      }
      const changed = structuredClone(data.unit_polygon.features[0])
      changed.geometry = { type: 'Point', coordinates: [114, 22] }
      expect(networkAnnotation(data, changed)).toBeUndefined()
      data.venue_polygon.features[0].properties.venue_id = 'another-venue'
      expect(networkAnnotation(data, data.unit_polygon.features[0])).toBeUndefined()
    })
  }
  it('covers the complete current 98-station catalogue without claiming unmatched polygons', () => {
    expect(Object.keys(manifest)).toHaveLength(98)
    expect(Object.values(manifest).reduce((n, entry) => n + entry.annotated, 0)).toBe(
      3274,
    )
    expect(Object.values(manifest).reduce((n, entry) => n + entry.unresolved, 0)).toBe(
      1265,
    )
    expect(manifest.AIR.annotated).toBe(0)
  })
})
