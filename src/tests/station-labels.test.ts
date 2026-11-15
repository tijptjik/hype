import { describe, expect, it } from 'vitest'
import { stationLabelFeatures } from '../lib/indoor/stationLabels'
import type { Collection, IndoorFeature } from '../lib/indoor/model'
import catalogue from '../lib/routing/mtr-catalog.json'

const footprint = (code: string): IndoorFeature => ({
  type: 'Feature',
  properties: { stationCode: code, isStation: true, indoorLabel: code },
  geometry: {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
      [
        [
          [2, 2],
          [3, 2],
          [3, 3],
          [2, 2],
        ],
      ],
    ],
  },
})

describe('persistent station label anchors', () => {
  it('emits one catalogue point per station despite multiple footprint features or parts', () => {
    const source: Collection = {
      type: 'FeatureCollection',
      features: [footprint('HOK'), footprint('HOK'), footprint('KOT')],
    }
    const labels = stationLabelFeatures(source)
    expect(labels.features).toHaveLength(2)
    for (const label of labels.features) {
      expect(label.geometry).toEqual({
        type: 'Point',
        coordinates: catalogue.stations.find(s => s.id === label.properties.stationCode)
          ?.coordinates,
      })
    }
    expect(source.features[0].geometry.type).toBe('MultiPolygon')
    source.features[0].geometry = { type: 'Point', coordinates: [0, 0] }
    expect(stationLabelFeatures(source)).toEqual(labels)
  })

  it('retains building labels and does not invent coordinates for unknown stations', () => {
    const building = footprint('MALL')
    building.properties.isStation = false
    expect(
      stationLabelFeatures({
        type: 'FeatureCollection',
        features: [building, footprint('UNKNOWN')],
      }).features,
    ).toEqual([building])
  })
})
