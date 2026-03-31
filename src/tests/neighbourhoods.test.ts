import { describe, expect, it } from 'vitest'

import {
  buildNeighbourhoodSubdivisionMap,
  getNeighbourhoodsAsResources,
} from '$lib/client/services/geospatial'
import neighbourhoods from '$lib/map/neighbourhoods.json'

describe('neighbourhood locales', () => {
  it('stores chinese neighbourhood translations under locale keys', () => {
    const central = neighbourhoods.Central.i18n

    expect(central.zhHant.name).toBe('中環')
    expect(central.zhHans.name).toBe('中环')
    expect(central).not.toHaveProperty('zh-hant')
    expect(central).not.toHaveProperty('zh-hans')
  })

  it('exposes neighbourhood resources with locale-keyed i18n', () => {
    const central = getNeighbourhoodsAsResources().find(
      neighbourhood => neighbourhood.id === 'Central',
    )

    expect(central?.i18n.zhHant.name).toBe('中環')
    expect(central?.i18n.zhHans.name).toBe('中环')
  })

  it('accepts locale codes when building subdivision labels', () => {
    const subdivisions = buildNeighbourhoodSubdivisionMap('zh-hant')

    expect(subdivisions.get('中環')).toContain('中環')
  })
})
