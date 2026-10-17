import { afterEach, describe, expect, it } from 'vitest'
import { filterDivisions, getDivisionName } from '#lib/client/services/geospatial.js'
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { getI18n, setLocale } from '#lib/i18n.js'
import type { AppCtx } from '#lib/context/app.svelte.js'
import type { DivisionFacet } from '#lib/api/services/featureQuery.types.js'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'

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
    const place = new DivisionCtx()
    place.setDivisionCounts({ parent, child })
    place.setDivisionFeatures([
      {
        id: 'a',
        divisionMemberships: [
          { divisionId: 'parent', selected: true },
          { divisionId: 'child', selected: true },
          { divisionId: 'candidate', selected: false },
        ],
      },
    ] as FeatureFromCollection[])
    expect(place.divisionFeatureCounts.get('parent')).toBe(2)
    expect(place.getFeaturesForDivision('parent')).toEqual(['a'])
    expect(place.getFeaturesForDivision('child')).toEqual(['a'])
    expect(place.getFeaturesForDivision('candidate')).toEqual([])
    place.toggleDivision('parent')
    place.toggleDivision('child')
    expect(place.getFeaturesForFilteredDivisions()).toEqual(['a'])
  })

  it('searches the current locale and preserves IDs across language switches', async () => {
    const place = new DivisionCtx()
    place.setDivisionCounts({ parent, child })
    place.toggleDivision('parent')
    const app = {
      divisionCtx: place,
      getUserPreferences: () => ({ fallbackLocales: ['en'] }),
    } as unknown as AppCtx
    await setLocale('zh-hant', { reload: false })
    expect(filterDivisions(app, '中環').map(([id]) => id)).toEqual(['parent'])
    expect(getI18n(parent, 'name', app.getUserPreferences())).toBe('中環')
    expect(getI18n(child, 'name', app.getUserPreferences())).toBe('Small Central')
    expect(getDivisionName(child, { fallbackLocales: [] })).toBe('Small Central')
    await setLocale('zh-hans', { reload: false })
    expect(filterDivisions(app, '中环').map(([id]) => id)).toEqual(['parent'])
    expect(place.getFilteredDivisions()).toEqual(['parent'])
    expect(filterDivisions(app, '').map(([id]) => id)).toEqual(['parent', 'child'])
  })
})
