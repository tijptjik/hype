// @vitest-environment node
// TESTS
import { describe, expect, it, vi } from 'vitest'
// DOMAIN
import {
  matchStreetHints,
  nearbyStreetHints,
  sampleStreetHints,
} from '#lib/map/nearbyStreets.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { setAddressName } from '#lib/addresses/nameCatalogue.js'
// TYPES
import type { AddressName } from '#lib/addresses/nameCatalogue.js'
import type { Map as MapLibreMap } from 'maplibre-gl'

const street: AddressName = {
  id: 'tung',
  names: { en: 'TUNG TAU WAN ROAD', 'zh-Hant': '東頭灣道' },
  divisionCodes: [],
}

it('applies a catalogue default name when the record has no English translation entry', () => {
  const source = emptyFeatureAddress()
  const next = setAddressName(source, 'streetName', {
    id: 'hollywood',
    name: 'Hollywood Road',
    names: {},
    divisionCodes: [],
  })
  expect(next.overrides.en.streetName).toBe('Hollywood Road')
  expect(next.overrides['zh-hant']?.streetName).toBeNull()
  expect(next.source).toEqual(source.source)
})

describe('map street suggestions', () => {
  it('measures to the road segment, handles multilingual names and excludes distant geometry and POIs', () => {
    const hints = sampleStreetHints(
      [
        {
          geometry: {
            type: 'LineString',
            coordinates: [
              [114.216, 22.216],
              [114.218, 22.216],
            ],
          },
          properties: { 'name:en': 'Tung Tau Wan Rd', 'name:zh': '東頭灣道' },
        },
        {
          geometry: { type: 'Point', coordinates: [114.217, 22.216] },
          properties: { name: 'Tung Tau Wan Road' },
        },
        {
          geometry: {
            type: 'LineString',
            coordinates: [
              [114.3, 22.3],
              [114.31, 22.3],
            ],
          },
          properties: { name: 'Far Road' },
        },
      ],
      [114.217, 22.216],
    )
    expect(hints).toHaveLength(1)
    expect(hints[0].distance).toBeCloseTo(0)
    expect(matchStreetHints(hints, [street])).toEqual([
      { street, distance: hints[0].distance },
    ])
  })

  it('deduplicates tile fragments, sorts nearest first and excludes unmatched or ambiguous names', () => {
    const other = { ...street, id: 'other', names: { en: 'Other Road' } }
    const matches = matchStreetHints(
      [
        { names: ['Tung Tau Wan Road'], distance: 50 },
        { names: ['Other Rd'], distance: 30 },
        { names: ['東頭灣道'], distance: 20 },
        { names: ['Martin House Walk'], distance: 1 },
      ],
      [street, other],
    )
    expect(matches.map(row => [row.street.id, row.distance])).toEqual([
      ['tung', 20],
      ['other', 30],
    ])
    expect(
      matchStreetHints(
        [{ names: ['Tung Tau Wan Road'], distance: 1 }],
        [street, { ...street, id: 'duplicate' }],
      ),
    ).toEqual([])
  })

  it('uses road source tiles even when their labels are hidden, querying each source layer once', () => {
    const querySourceFeatures = vi.fn().mockReturnValue([])
    const map = {
      isStyleLoaded: () => true,
      getZoom: () => 18,
      getStyle: () => ({
        layers: [
          { source: 'basemap', 'source-layer': 'roads' },
          { source: 'basemap', 'source-layer': 'roads' },
          { source: 'basemap', 'source-layer': 'places' },
        ],
      }),
      querySourceFeatures,
    } as unknown as MapLibreMap
    expect(nearbyStreetHints(map, [114.217, 22.216])).toEqual([])
    expect(querySourceFeatures).toHaveBeenCalledExactlyOnceWith('basemap', {
      sourceLayer: 'roads',
    })
  })

  it('fills only canonical street names without inventing an address identity or moving the pin', () => {
    const address = emptyFeatureAddress()
    address.coordinates = [114.217, 22.216]
    const next = setAddressName(address, 'streetName', street)
    expect(next.coordinates).toEqual(address.coordinates)
    expect(next.source).toEqual(address.source)
    expect(next.overrides.en.streetName).toBe(street.names.en)
    expect(next.overrides['zh-hant'].streetName).toBe(street.names['zh-Hant'])
    expect(next.overrides.en.buildingNumberExpression).toBeUndefined()
  })
})

it('limits default street suggestions to 100 metres from the pin', () => {
  const latitudePerMetre = 180 / (Math.PI * 6371008.8)
  const road = (distance: number) => ({
    geometry: {
      type: 'LineString' as const,
      coordinates: [
        [-0.001, distance * latitudePerMetre],
        [0.001, distance * latitudePerMetre],
      ],
    },
    properties: { name: `Road ${distance}` },
  })
  const hints = sampleStreetHints([road(99), road(100), road(101), road(400)], [0, 0])
  expect(hints.map(hint => hint.names[0])).toEqual(['Road 99', 'Road 100'])
})
