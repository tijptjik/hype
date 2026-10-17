import { describe, expect, it } from 'vitest'
import { searchAllAsync } from '#lib/map/data.js'
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'

describe('map search data', () => {
  it('shares polygon-backed options and hides broad classes only in the initial preview', async () => {
    const divisions = new Map([
      [
        'area',
        {
          id: 'area',
          class: 'area',
          level: 1,
          divisionCode: 'HKI',
          hasGeometry: true,
          count: 20,
          i18n: { en: { name: 'Hong Kong Island' } },
        },
      ],
      [
        'hood',
        {
          id: 'hood',
          class: 'neighbourhood',
          level: null,
          divisionCode: 'SOHO',
          hasGeometry: true,
          count: 5,
          i18n: { en: { name: 'Soho' } },
        },
      ],
      [
        'point',
        {
          id: 'point',
          class: 'village',
          level: null,
          hasGeometry: false,
          count: 10,
          i18n: { en: { name: 'Point only' } },
        },
      ],
    ])
    const app = {
      getUserPreferences: () => ({}),
      resources: {
        featureQueries: { searchWishlist: { totalCount: null }, search: { rows: [] } },
      },
      divisionCtx: {
        divisions,
        divisionFeatureCounts: new Map(
          [...divisions].map(([id, division]) => [id, division.count]),
        ),
      },
    } as unknown as ResourceViewCtx
    expect((await searchAllAsync('', app)).map(row => row.ref)).toEqual(['hood'])
    expect((await searchAllAsync('hki', app)).map(row => row.ref)).toEqual(['area'])
    expect(await searchAllAsync('Point only', app)).toEqual([])
  })

  it('keeps generated feature titles visible in search results', async () => {
    const appCtx = {
      getUserPreferences: () => ({
        fallbackLocales: [],
        allowMachineTranslation: false,
        preferFallbackInCurrentLocale: false,
        isTranslateButtonVisible: true,
      }),
      resources: {
        featureQueries: {
          searchWishlist: { search: 'mong', totalCount: null },
          search: {
            search: 'mong',
            rows: [
              {
                id: 'feature-mong',
                i18n: {
                  en: {
                    title: 'Mong Kok Hotel',
                    titleGen: true,
                  },
                },
              },
            ],
          },
        },
      },
      divisionCtx: { divisionFeatureCounts: new Map(), divisions: new Map() },
    } as unknown as ResourceViewCtx

    await expect(searchAllAsync('mong', appCtx)).resolves.toEqual([
      {
        name: 'Mong Kok Hotel',
        count: 1,
        collectionType: 'feature',
        ref: 'feature-mong',
      },
    ])
  })
})
