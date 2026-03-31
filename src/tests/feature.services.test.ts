import { describe, expect, it } from 'vitest'

import { normalizeFeaturePropertiesForLayer } from '$lib/api/services/feature'

import type { Layer } from '$lib/db/zod/schema/layer.types'

describe('feature service property normalization', () => {
  it('filters hidden layer properties and synthesizes missing visible ones', () => {
    const properties = [
      {
        id: 'feature-prop-visible',
        featureId: 'feature-1',
        propertyId: 'visible-existing',
        value: 'kept',
        propertyValueId: null,
      },
      {
        id: 'feature-prop-hidden',
        featureId: 'feature-1',
        propertyId: 'hidden-property',
        value: 'removed',
        propertyValueId: null,
      },
    ]

    const layer = {
      properties: [
        {
          layerId: 'layer-1',
          propertyId: 'visible-existing',
          isVisible: true,
          isUserContributable: true,
          property: {
            id: 'visible-existing',
            key: 'visible-existing',
            i18n: {},
            values: [],
          },
        },
        {
          layerId: 'layer-1',
          propertyId: 'visible-missing',
          isVisible: true,
          isUserContributable: true,
          property: {
            id: 'visible-missing',
            key: 'visible-missing',
            i18n: {},
            values: [],
          },
        },
        {
          layerId: 'layer-1',
          propertyId: 'hidden-property',
          isVisible: false,
          isUserContributable: true,
        },
      ],
    } as unknown as Layer

    const normalized = normalizeFeaturePropertiesForLayer(
      'feature-1',
      properties,
      layer,
    )

    expect(normalized.map(property => property.propertyId)).toEqual([
      'visible-existing',
      'visible-missing',
    ])
    expect(
      normalized.find(property => property.propertyId === 'visible-missing'),
    ).toMatchObject({
      featureId: 'feature-1',
      propertyId: 'visible-missing',
      value: null,
      propertyValueId: null,
    })
  })

  it('leaves properties unchanged when no layer is available', () => {
    const properties = [
      {
        id: 'feature-prop-1',
        featureId: 'feature-2',
        propertyId: 'kept',
        value: 'value',
        propertyValueId: null,
      },
    ]

    const normalized = normalizeFeaturePropertiesForLayer('feature-2', properties, null)

    expect(normalized).toEqual(properties)
  })
})
