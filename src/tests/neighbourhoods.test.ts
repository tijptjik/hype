import { afterEach, describe, expect, it } from 'vitest'
import { filterPlaces, getDivisionName } from '$lib/client/services/geospatial'
import { PlaceCtx } from '$lib/context/place.svelte'
import { getI18n, setLocale } from '$lib/i18n'
import type { AppCtx } from '$lib/context/app.svelte'
import type { DivisionFacet } from '$lib/api/services/featureQuery.types'
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'

afterEach(async () => {
  await setLocale('en', { reload: false })
})

const parent: DivisionFacet = {
  id: 'parent',
  level: 5,
  category: 'hood',
  class: 'neighbourhood',
  count: 2,
  i18n: { en: { name: 'Central' }, zhHant: { name: '中環' }, zhHans: { name: '中环' } },
}
const child: DivisionFacet = {
  id: 'child',
  level: 6,
  category: 'hood',
  class: 'microhood',
  count: 1,
  i18n: { en: { name: 'Small Central' } },
}

describe('registry neighbourhoods', () => {
  it('keeps exact parent and child counts and indexes every selected membership', () => {
    const place = new PlaceCtx()
    place.setNeighbourhoodCounts({ parent, child })
    place.setNeighbourhoodFeatures([
      {
        id: 'a',
        divisionMemberships: [
          { divisionId: 'parent', selected: true },
          { divisionId: 'child', selected: true },
          { divisionId: 'candidate', selected: false },
        ],
      },
    ] as FeatureFromCollection[])
    expect(place.neighbourhoodFeatureCounts.get('parent')).toBe(2)
    expect(place.getFeaturesForNeighbourhood('parent')).toEqual(['a'])
    expect(place.getFeaturesForNeighbourhood('child')).toEqual(['a'])
    expect(place.getFeaturesForNeighbourhood('candidate')).toEqual([])
    place.toggleNeighbourhood('parent')
    place.toggleNeighbourhood('child')
    expect(place.getFeaturesForFilteredNeighbourhoods()).toEqual(['a'])
  })

  it('searches the current locale and preserves IDs across language switches', async () => {
    const place = new PlaceCtx()
    place.setNeighbourhoodCounts({ parent, child })
    place.toggleNeighbourhood('parent')
    const app = {
      placeCtx: place,
      getUserPreferences: () => ({ fallbackLocales: ['en'] }),
    } as unknown as AppCtx
    await setLocale('zh-hant', { reload: false })
    expect(filterPlaces(app, '中環').map(([id]) => id)).toEqual(['parent'])
    expect(getI18n(parent, 'name', app.getUserPreferences())).toBe('中環')
    expect(getI18n(child, 'name', app.getUserPreferences())).toBe('Small Central')
    expect(getDivisionName(child, { fallbackLocales: [] })).toBe('Small Central')
    await setLocale('zh-hans', { reload: false })
    expect(filterPlaces(app, '中环').map(([id]) => id)).toEqual(['parent'])
    expect(place.getFilteredNeighbourhoods()).toEqual(['parent'])
    expect(filterPlaces(app, '').map(([id]) => id)).toEqual(['parent', 'child'])
  })
})
