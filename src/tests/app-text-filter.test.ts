import { describe, expect, it } from 'vitest'

import { matchesResourceTextQuery } from '$lib/client/services/resourceText'

describe('matchesResourceTextQuery', () => {
  it('keeps entities visible for an empty query even without i18n', () => {
    expect(
      matchesResourceTextQuery(
        {
          id: 'feature-1',
          i18n: null,
        } as never,
        '',
        'en',
      ),
    ).toBe(true)
  })

  it('falls back to id and code when localized copy is unavailable', () => {
    expect(
      matchesResourceTextQuery(
        {
          id: 'feature-1',
          code: 'project-alpha',
          i18n: null,
        } as never,
        'alpha',
        'en',
      ),
    ).toBe(true)

    expect(
      matchesResourceTextQuery(
        {
          id: 'feature-1',
          i18n: null,
        } as never,
        'feature-1',
        'en',
      ),
    ).toBe(true)
  })

  it('matches localized text and contributor names when present', () => {
    expect(
      matchesResourceTextQuery(
        {
          id: 'feature-1',
          layerId: 'layer-1',
          i18n: {
            en: {
              title: 'Lantern Workshop',
            },
          },
          contributor: {
            name: 'Ava',
          },
        } as never,
        'lantern',
        'en',
      ),
    ).toBe(true)

    expect(
      matchesResourceTextQuery(
        {
          id: 'feature-1',
          layerId: 'layer-1',
          i18n: {
            en: {
              title: 'Lantern Workshop',
            },
          },
          contributor: {
            name: 'Ava',
          },
        } as never,
        'ava',
        'en',
      ),
    ).toBe(true)
  })
})
