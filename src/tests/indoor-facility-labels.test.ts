import { describe, expect, it } from 'vitest'
import {
  canonicalFacilityLabel,
  normalizeMapFacilityLabels,
} from '../lib/indoor/facilityLabels'
import { collection, layerNames, places, type IndoorData } from '../lib/indoor/model'

const feature = (properties: Record<string, unknown>) => ({
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: [114, 22] },
  properties,
})

describe('imported facility terminology', () => {
  it.each([
    ['RAMP', 'Ramp'],
    ['Ramps', 'Ramp'],
    ['PLATFORM', 'Platform'],
    ['Platforms', 'Platform'],
    ['ACCESSIBLE TOILETS', 'Accessible Toilet'],
    ['Stair', 'Stairs'],
    ['STAIRS', 'Stairs'],
    ['Step', 'Steps'],
    ['STEPS', 'Steps'],
    ['CORRIDOR', 'Corridor'],
    [
      'Platform 1 Kwun Tong Line to Tiu Keng Leng',
      'Platform 1 Kwun Tong Line To Tiu Keng Leng',
    ],
    [
      'AUTOMATED EXTERNAL DEFIBRILLATOR (AED)',
      'Automated External Defibrillator (AED)',
    ],
    ['ATM', 'ATM'],
    ['Exit A2', 'Exit A2'],
    ['E3', 'E3'],
    ['CUC', 'CUC'],
  ])('%s becomes %s and is idempotent', (source, expected) => {
    expect(canonicalFacilityLabel(source)).toBe(expected)
    expect(canonicalFacilityLabel(expected)).toBe(expected)
  })

  it('normalizes derived facility fields, preserves brands, and presents existing raw maps consistently', () => {
    const data = {
      ...Object.fromEntries(layerNames.map(layer => [layer, collection([])])),
      retrievedAt: '2026-11-15T00:00:00Z',
    } as IndoorData
    data.unit_polygon.features = [
      feature({
        unit_id: 'ramp',
        unit_category: 'ramp',
        unit_name_en: 'RAMP',
        unit_name_zh: '斜道',
      }),
      feature({ unit_id: 'shop', unit_category: 'room', unit_name_en: 'IKEA' }),
      feature({ unit_id: 'retail', unit_category: 'retail', unit_name_en: '7-ELEVEN' }),
    ]
    data.occupant_point.features = [
      feature({ unit_id: 'shop', occupant_name_en: 'IKEA' }),
    ]
    data.amenity_point.features = [
      feature({
        amenity_id: 'a',
        amenity_category: 'stairs',
        amenity_name_en: 'Stair',
      }),
    ]
    const derived = structuredClone(data)
    normalizeMapFacilityLabels(derived)
    expect(derived.unit_polygon.features.map(f => f.properties.unit_name_en)).toEqual([
      'Ramp',
      'IKEA',
      '7-ELEVEN',
    ])
    expect(derived.amenity_point.features[0].properties.amenity_name_en).toBe('Stairs')
    expect(derived.unit_polygon.features[0].properties.unit_name_zh).toBe('斜道')
    expect(places(data).find(p => p.id === 'ramp')?.name.en).toBe('Ramp')
    expect(places(data).find(p => p.id === 'shop')?.name.en).toBe('IKEA')
    expect(places(data).find(p => p.id === 'retail')?.name.en).toBe('7-ELEVEN')
    expect(data.unit_polygon.features[0].properties.unit_name_en).toBe('RAMP')
  })
})
