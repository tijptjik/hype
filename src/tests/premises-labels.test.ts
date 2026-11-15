// TESTS
import { describe, expect, it } from 'vitest'
// DOMAIN
import {
  premisesLabel,
  premisesNameI18n,
  premisesTypography,
} from '../lib/indoor/premisesLabels'
import { stations, searchStations } from '../lib/indoor/registry'
// TYPES
import type { SymbolLayerSpecification } from 'maplibre-gl'

describe('indoor premises labels', () => {
  it('provides separate name values for all supported premises locales', () => {
    expect(premisesNameI18n({ name: 'Admiralty', nameZh: '金鐘' })).toEqual({
      en: { name: 'Admiralty' },
      zhHant: { name: '金鐘' },
      zhHans: { name: '金钟' },
    })
  })

  it('covers every station and searches both Chinese scripts independently of display', () => {
    for (const station of stations) {
      expect(station.i18n.en.name).toBe(station.name)
      expect(station.i18n.zhHant.name).toBe(station.nameZh)
      expect(station.i18n.zhHans.name.trim()).not.toBe('')
    }
    expect(searchStations('金鐘').map(station => station.id)).toContain('ADM')
    expect(searchStations('金钟').map(station => station.id)).toContain('ADM')
    expect(searchStations('港铁')).toHaveLength(stations.length)
  })

  it('uses Chinese catalogue names for both supported Chinese locales', () => {
    const premises = { name: 'Kennedy Town', nameZh: '堅尼地城' }
    expect(premisesLabel(premises, 'en')).toBe('Kennedy Town')
    expect(premisesLabel(premises, 'zh-Hant')).toBe('堅尼地城')
    expect(premisesLabel(premises, 'zh-Hans')).toBe('堅尼地城')
    expect(premisesLabel({ name: 'Hysan Place', nameZh: '希慎廣場' }, 'zh-Hant')).toBe(
      '希慎廣場',
    )
    expect(premisesLabel({ name: 'Fallback', nameZh: ' ' }, 'zh-Hant')).toBe('Fallback')
  })

  it('shares major-road typography while leaving placement and text independent', () => {
    const road: SymbolLayerSpecification = {
      id: 'roads_labels_major',
      type: 'symbol',
      source: 'basemap',
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Medium'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 12, 18, 18],
        'symbol-placement': 'line',
      },
      paint: {
        'text-color': '#f8f',
        'text-halo-color': '#123',
        'text-halo-width': 0.55,
      },
    }
    const text = premisesTypography(road)
    expect(text.layout?.['text-font']).toEqual(road.layout?.['text-font'])
    expect(text.layout?.['text-size']).toEqual(road.layout?.['text-size'])
    expect(text.paint?.['text-halo-width']).toBe(0.55)
    expect(text.layout?.['text-field']).toBeUndefined()
    expect(text.layout?.['symbol-placement']).toBeUndefined()
  })
})
