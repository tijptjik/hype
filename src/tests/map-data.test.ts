import { describe, expect, it } from 'vitest'
import { searchAllAsync } from '$lib/map/data'
import type { AppCtx } from '$lib/context/app.svelte'

describe('map search data', () => {
  it('keeps generated feature titles visible in search results', async () => {
    const appCtx = {
      getUserPreferences: () => ({
        fallbackLocales: [],
        allowMachineTranslation: false,
        preferFallbackInCurrentLocale: false,
        isTranslateButtonVisible: true,
      }),
      cacheCtx: {
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
      placeCtx: { neighbourhoodFeatureCounts: new Map(), divisions: new Map() },
    } as unknown as AppCtx

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
