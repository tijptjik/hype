import { describe, expect, it, vi } from 'vitest'

import {
  getNonTranslatableFeatureFieldItems,
  getTranslatableSpecifierProperties,
  toFeatureFormInput,
} from '$lib/client/services/feature'
import { normalizeFeaturePropertiesForLayer } from '$lib/api/services/feature'
import { FeatureAdminProfileAPI } from '$lib/db/zod/schema/feature'

import type { Layer } from '$lib/db/zod/schema/layer.types'

vi.mock('$lib/client/services/task', () => ({
  upsertNewFeatureDraft: vi.fn(),
}))

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

  it('projects select fields from propertyValueId for display', () => {
    const items = getNonTranslatableFeatureFieldItems({
      localeKey: 'en',
      isEditing: true,
      onChange: () => {},
      properties: [
        {
          propertyId: 'property-country',
          value: '',
          propertyValueId: 'value-taiwan',
          i18n: {},
          property: {
            id: 'property-country',
            key: 'country',
            type: 'classifier',
            component: 'SelectField',
            i18n: { en: { label: 'Country' } },
            values: [
              {
                id: 'value-taiwan',
                propertyId: 'property-country',
                rank: 1,
                value: 'Taiwan',
                i18n: { en: { value: 'Taiwan' } },
              },
            ],
          },
          propertyValue: {
            id: 'value-taiwan',
            propertyId: 'property-country',
            rank: 1,
            value: 'Taiwan',
            i18n: { en: { value: 'Taiwan' } },
          },
        },
      ],
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      value: 'value-taiwan',
      options: [{ value: 'value-taiwan', label: 'Taiwan' }],
    })
  })

  it('preserves loaded translatable feature-property values in form input', () => {
    const formInput = toFeatureFormInput({
      id: 'feature-1',
      organisationId: 'org-1',
      projectId: 'project-1',
      layerId: 'layer-1',
      contributorId: 'user-1',
      geometry: { type: 'Point', coordinates: [114, 22] },
      addressMeta: {},
      isIntangible: false,
      isVisitable: true,
      isPendingReview: false,
      modifiedAt: '2026-06-19T00:00:00.000Z',
      i18n: {},
      properties: [
        {
          propertyId: 'property-synopsis',
          value: null,
          propertyValueId: null,
          i18n: {
            en: { value: 'Final synopsis sample', valueGen: false },
            zhHans: { value: '现有自由文字栏位摘要四', valueGen: false },
            zhHant: { value: '現有自由文字欄位摘要四', valueGen: false },
          },
          property: {
            id: 'property-synopsis',
            key: 'synopsis',
            type: 'specifier',
            component: 'InputField',
            isTranslatable: true,
            i18n: { en: { label: 'Synopsis' } },
          },
          propertyValue: null,
        },
      ],
    } as never)

    expect(formInput.data.properties[0].i18n).toMatchObject({
      en: { value: 'Final synopsis sample', valueGen: false },
      zhHans: { value: '现有自由文字栏位摘要四', valueGen: false },
      zhHant: { value: '現有自由文字欄位摘要四', valueGen: false },
    })
    expect(getTranslatableSpecifierProperties(formInput.data.properties)).toHaveLength(
      1,
    )
  })

  it('accepts blank feature-property locale values in admin profiles', () => {
    const parsed = FeatureAdminProfileAPI.safeParse({
      id: 'feature-1',
      organisationId: 'org-1',
      projectId: 'project-1',
      layerId: 'layer-1',
      contributorId: 'user-1',
      geometry: { type: 'Point', coordinates: [114, 22] },
      addressMeta: {},
      isPublished: false,
      localIsPublished: null,
      publisherId: null,
      publishedAt: null,
      isPendingReview: false,
      isArchived: false,
      isDraft: false,
      localIsArchived: null,
      isIntangible: false,
      isVisitable: true,
      visitableAsOf: '2026-06-20',
      createdAt: '2026-06-20T00:00:00.000Z',
      modifiedAt: '2026-06-20T00:00:00.000Z',
      i18n: {
        en: {
          featureId: 'feature-1',
          locale: 'en',
          title: 'Feature',
          titleGen: false,
          description: '',
          descriptionGen: false,
          displayAddress: '',
          displayAddressGen: false,
          addressProperties: {},
        },
        zhHans: {
          featureId: 'feature-1',
          locale: 'zh-hans',
          title: 'Feature',
          titleGen: false,
          description: '',
          descriptionGen: false,
          displayAddress: '',
          displayAddressGen: false,
          addressProperties: {},
        },
        zhHant: {
          featureId: 'feature-1',
          locale: 'zh-hant',
          title: 'Feature',
          titleGen: false,
          description: '',
          descriptionGen: false,
          displayAddress: '',
          displayAddressGen: false,
          addressProperties: {},
        },
      },
      properties: [
        {
          featureId: 'feature-1',
          propertyId: 'property-note',
          value: null,
          propertyValueId: null,
          i18n: {
            en: {
              featureId: 'feature-1',
              propertyId: 'property-note',
              locale: 'en',
              value: 'Fourth localized freeform note',
              valueGen: false,
            },
            zhHans: {
              featureId: 'feature-1',
              propertyId: 'property-note',
              locale: 'zh-hans',
              value: '',
              valueGen: false,
            },
            zhHant: {
              featureId: 'feature-1',
              propertyId: 'property-note',
              locale: 'zh-hant',
              value: '',
              valueGen: false,
            },
          },
          property: undefined,
          propertyValue: null,
        },
      ],
      contributor: null,
      publisher: null,
      image: null,
      images: null,
    })

    expect(parsed.success).toBe(true)
  })
})
