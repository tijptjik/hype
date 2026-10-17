import { afterEach, describe, expect, it } from 'vitest'
import { filterDivisions, getDivisionName } from '#lib/client/services/geospatial.js'
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { getI18n, setLocale } from '#lib/i18n.js'
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { DivisionFacet } from '#lib/api/services/featureQuery.types.js'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'

afterEach(async () => {
  await setLocale('en', { reload: false })
})

const parent: DivisionFacet = {
  id: 'parent',
  hasGeometry: true,
  divisionCode: 'CENTRAL',
  level: 5,
  category: 'hood',
  class: 'neighbourhood',
  count: 2,
  i18n: { en: { name: 'Central' }, zhHant: { name: '中環' }, zhHans: { name: '中环' } },
}
const child: DivisionFacet = {
  id: 'child',
  hasGeometry: true,
  level: 6,
  category: 'hood',
  class: 'microhood',
  count: 1,
  i18n: { en: { name: 'Small Central' } },
}

describe('registry neighbourhoods', () => {
  it('ranks divisions by current collection counts and reorders after layers change', () => {
    const place = new DivisionCtx()
    const other = {
      ...child,
      id: 'other',
      i18n: { en: { name: 'Another neighbourhood' } },
    }
    place.setDivisionCounts({ parent, child: { ...child, count: 8 }, other })
    const app = {
      divisionCtx: place,
      getUserPreferences: () => ({}),
    } as unknown as ResourceViewCtx
    expect(filterDivisions(app, '').map(([id]) => id)).toEqual([
      'child',
      'parent',
      'other',
    ])

    // A new active-layer facet response changes rank; ties keep level/name ordering.
    place.setDivisionCounts({
      parent: { ...parent, count: 4 },
      child: { ...child, count: 4 },
      other: { ...other, count: 4 },
    })
    expect(filterDivisions(app, '').map(([id]) => id)).toEqual([
      'parent',
      'other',
      'child',
    ])
    expect(filterDivisions(app, 'Central').map(([id]) => id)).toEqual([
      'parent',
      'child',
    ])
    place.setDivisionCounts({ parent: { ...parent, count: 0 }, child })
    expect(filterDivisions(app, '').map(([id]) => id)).toEqual(['child'])
  })

  it('excludes the SAR from both initial options and explicit name/code searches', () => {
    const place = new DivisionCtx()
    place.setDivisionCounts({
      parent,
      sar: {
        ...parent,
        id: 'sar',
        class: 'sar',
        divisionCode: 'HKSAR',
        i18n: { en: { name: 'Hong Kong' } },
      },
    })
    const app = {
      divisionCtx: place,
      getUserPreferences: () => ({}),
    } as unknown as ResourceViewCtx
    expect(filterDivisions(app, '').map(([id]) => id)).toEqual(['parent'])
    expect(filterDivisions(app, 'Hong Kong')).toEqual([])
    expect(filterDivisions(app, 'HKSAR')).toEqual([])
    expect(place.divisions.has('sar')).toBe(true)
  })

  it('shares class visibility without clearing an active division selection', () => {
    const place = new DivisionCtx()
    place.setDivisionCounts({ parent, child })
    place.toggleDivision(parent.id)
    place.hiddenClasses.add('neighbourhood')
    const app = {
      divisionCtx: place,
      getUserPreferences: () => ({}),
    } as unknown as ResourceViewCtx
    expect(filterDivisions(app, '').map(([id]) => id)).toEqual(['child'])
    expect(filterDivisions(app, 'Central', true).map(([id]) => id)).toEqual([
      'parent',
      'child',
    ])
    expect(place.getFilteredDivisions()).toEqual(['parent'])
  })

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
    } as unknown as ResourceViewCtx
    await setLocale('zh-hant', { reload: false })
    expect(filterDivisions(app, '中環').map(([id]) => id)).toEqual(['parent'])
    expect(getI18n(parent, 'name', app.getUserPreferences())).toBe('中環')
    expect(getI18n(child, 'name', app.getUserPreferences())).toBe('Small Central')
    expect(getDivisionName(child, { fallbackLocales: [] })).toBe('Small Central')
    await setLocale('zh-hans', { reload: false })
    expect(filterDivisions(app, '中环').map(([id]) => id)).toEqual(['parent'])
    expect(place.getFilteredDivisions()).toEqual(['parent'])
    expect(filterDivisions(app, 'central').map(([id]) => id)).toEqual([
      'parent',
      'child',
    ])
    place.setDivisionCounts({
      parent,
      child,
      missing: { ...child, id: 'missing', hasGeometry: false },
    })
    expect(filterDivisions(app, '').map(([id]) => id)).toEqual(['parent', 'child'])
  })
})
