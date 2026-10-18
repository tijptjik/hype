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

  it.each(['breadline-light', 'breadline-dark'] as const)(
    '%s declutters full badges without losing entrance positions',
    key => {
      const style = buildMapStyle(key)
      expect(validateStyleMin(style)).toEqual([])
      const exits = style.layers.find(layer => layer.id === 'breadline-mtr-exits')
      if (exits?.type !== 'symbol') throw new Error('Missing entrance symbols')
      expect(exits.layout).toMatchObject({
        'icon-allow-overlap': false,
        'icon-ignore-placement': false,
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-optional': false,
        'icon-optional': false,
      })
      expect(exits.layout?.['text-variable-anchor']).toHaveLength(4)
      for (const role of ['major', 'minor']) {
        const original = style.layers.findIndex(
          layer => layer.id === `roads_labels_${role}`,
        )
        for (const [suffix, offset] of [
          ['0', 0],
          ['3', 3],
          ['-3', -3],
        ] as const) {
          const candidate = style.layers.find(
            layer => layer.id === `roads_labels_${role}__shift_${suffix}`,
          )
          expect(
            candidate?.type === 'symbol' && candidate.layout?.['text-offset'],
          ).toEqual([offset, 0])
          expect(candidate && style.layers.indexOf(candidate)).toBeLessThan(original)
        }
      }
      const exitIndex = style.layers.indexOf(exits)
      const streetLabels = style.layers.filter(layer =>
        layer.id.startsWith('roads_labels_'),
      )
      expect(streetLabels.length).toBeGreaterThan(0)
      for (const street of streetLabels) {
        if (!street.id.includes('__shift_')) {
          expect(street.type === 'symbol' && street.layout?.['symbol-spacing']).toBe(
            750 / 1.5,
          )
        } else {
          expect(street.type === 'symbol' && street.layout?.['symbol-placement']).toBe(
            'line-center',
          )
        }
        // Road candidates find room around the fixed MTR badges.
        expect(style.layers.indexOf(street)).toBeLessThan(exitIndex)
      }
      expect(
        style.layers.find(layer => layer.id === 'breadline-mtr-exit-points'),
      ).toMatchObject({
        type: 'circle',
        source: 'mtr-entrances',
        minzoom: 15,
      })
    },
  )

  it('shows shopping landmarks before ordinary building labels', () => {
    const style = buildMapStyle('breadline-light', { locale: 'zhHant' })
    expect(
      style.layers.find(layer => layer.id === 'breadline-mall-names')?.minzoom,
    ).toBe(15)
    expect(
      style.layers.find(layer => layer.id === 'breadline-building-names')?.minzoom,
    ).toBe(17)
    const data = JSON.parse(
      readFileSync('static/mapData/building-labels.geojson', 'utf8'),
    )
    const hysan = data.features.find(
      (feature: { properties: Record<string, string> }) =>
        feature.properties.kind === 'mall' &&
        feature.properties['name:en'] === 'Hysan Place',
    )
    expect(hysan.properties['name:zh-Hant']).toBe('希慎廣場')
    expect(hysan.geometry.type).toBe('Point')
    expect(
      buildMapStyle('breadline-light', { noLabels: true }).sources,
    ).not.toHaveProperty('building-labels')
  })

  it('keeps no-label renders free of symbols', () => {
    expect(
      buildMapStyle('breadline-light', { noLabels: true }).layers.some(
        layer => layer.type === 'symbol',
      ),
    ).toBe(false)
  })
})
