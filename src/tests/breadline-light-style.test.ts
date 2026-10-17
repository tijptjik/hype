import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { buildMapStyle, listMapStyleCatalog } from '#lib/map/styles/index.js'

describe('Breadline Light', () => {
  it('registers a valid Milque style with its custom exit sprite', () => {
    const style = buildMapStyle('breadline-light')
    expect(validateStyleMin(style)).toEqual([])
    expect(
      listMapStyleCatalog().find(entry => entry.key === 'breadline-light')?.hubCode,
    ).toBe('breadline')
    expect(style.sprite).toContainEqual({
      id: 'breadline',
      url: '/mapSprites/breadline-light/exit',
    })
    expect(style.layers.some(layer => layer.id === 'pois')).toBe(false)
    const exits = style.layers.find(layer => layer.id === 'breadline-mtr-exits')
    expect(exits?.type === 'symbol' ? exits.filter : undefined).toEqual([
      '==',
      'kind',
      'subway_entrance',
    ])
  })
  it('uses source-backed exit references instead of the lossy vector POIs', () => {
    const style = buildMapStyle('breadline-light')
    const exits = style.layers.find(layer => layer.id === 'breadline-mtr-exits')
    expect(exits).toMatchObject({ source: 'mtr-entrances', type: 'symbol' })
    expect(exits).not.toHaveProperty('source-layer')
    expect(style.sources['mtr-entrances']).toMatchObject({
      type: 'geojson',
      data: '/mapData/mtr-entrances.geojson',
    })
    const data = JSON.parse(
      readFileSync('static/mapData/mtr-entrances.geojson', 'utf8'),
    )
    const mongKokB2 = data.features.find(
      (feature: { id: number }) => feature.id === 1277848661,
    )
    expect(mongKokB2.properties.ref).toBe('B2')
    expect(mongKokB2.geometry.coordinates).toEqual([114.1696731, 22.3203941])
    expect(
      data.features.some(
        (feature: { properties: { ref: string } }) => feature.properties.ref === '',
      ),
    ).toBe(true)
  })

  it('keeps no-label renders free of symbols', () => {
    expect(
      buildMapStyle('breadline-light', { noLabels: true }).layers.some(
        layer => layer.type === 'symbol',
      ),
    ).toBe(false)
  })
})
