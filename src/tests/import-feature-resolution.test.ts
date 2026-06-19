import { describe, expect, it, vi } from 'vitest'

import { mergeFeatureData } from '$lib/client/services/import/features/resolution'

import type { ImportCtx } from '$lib/context/import.svelte'

vi.mock('$lib/api/server/feature.remote', () => ({
  featureForm: {},
  getFeatureForImport: vi.fn(),
}))

vi.mock('$lib/client/services/feature', () => ({
  toFeatureFormInput: vi.fn(),
}))

function createImportCtx(
  enrichedData: Map<string, Record<string, unknown>>,
): ImportCtx {
  return {
    getSelectedOrganisation: () => ({ id: 'org-1' }),
    getSelectedProject: () => ({ id: 'project-1' }),
    getLayerValidation: () => ({ fallbackLayerId: 'layer-1' }),
    getSelectedLayer: () => null,
    getLayerResolution: () => ({ resolutions: new Map() }),
    getAllLayers: () => [],
    getLayersLoaded: () => true,
    setLayerValidation: vi.fn(),
    getUserValidation: () => ({ fallbackUserId: 'user-1' }),
    getUserResolution: () => ({ resolutions: new Map() }),
    getPropertyReconciliation: () => ({ enrichedData }),
    getFetchedProperties: () => [
      {
        id: 'property-genre',
        key: 'genre',
        type: 'classifier',
        component: 'SelectField',
      },
      {
        id: 'property-country',
        key: 'country',
        type: 'classifier',
        component: 'SelectField',
      },
      {
        id: 'property-note',
        key: 'fixture_new_note',
        type: 'specifier',
        component: 'InputField',
        isTranslatable: false,
      },
      {
        id: 'property-synopsis',
        key: 'synopsis',
        type: 'specifier',
        component: 'TextareaField',
        isTranslatable: true,
      },
    ],
  } as unknown as ImportCtx
}

describe('import feature property resolution', () => {
  it('uses row-enriched classifier propertyValueIds instead of stale mappings', () => {
    const importCtx = createImportCtx(
      new Map([
        [
          'genre',
          {
            propertyId: 'property-genre',
            propertyType: 'classifier',
            resolvedValues: { Crime: 'stale-genre-option' },
          },
        ],
        [
          'country',
          {
            propertyId: 'property-country',
            propertyType: 'classifier',
            propertyValueMapping: { 'Hong Kong': 'stale-country-option' },
          },
        ],
      ]),
    )
    const submitted = {
      feature: {},
      i18n: {},
      properties: {
        genre: { i18n: { en: { value: 'Crime' } } },
        country: { value: 'Hong Kong' },
      },
      user: {},
      layer: {},
      addressMeta: {},
    }
    const enriched = {
      properties: {
        genre: {
          propertyId: 'property-genre',
          propertyValueId: 'genre-option-crime',
        },
        country: {
          propertyId: 'property-country',
          propertyValueId: 'country-option-hk',
        },
      },
    }

    const merged = mergeFeatureData(null, submitted, enriched, importCtx)

    expect(merged.properties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          propertyId: 'property-genre',
          propertyValueId: 'genre-option-crime',
          value: null,
        }),
        expect.objectContaining({
          propertyId: 'property-country',
          propertyValueId: 'country-option-hk',
          value: null,
        }),
      ]),
    )
    expect(
      merged.properties.find(property => property.propertyId === 'property-genre')
        ?.propertyValueId,
    ).not.toBe('stale-genre-option')
  })

  it('keeps freeform direct values and translatable values in their storage paths', () => {
    const importCtx = createImportCtx(
      new Map([
        [
          'fixture_new_note',
          {
            propertyId: 'property-note',
            propertyType: 'specifier',
          },
        ],
        [
          'synopsis',
          {
            propertyId: 'property-synopsis',
            propertyType: 'specifier',
          },
        ],
      ]),
    )
    const submitted = {
      feature: {},
      i18n: {},
      properties: {
        fixture_new_note: { value: 'Submitted note' },
        synopsis: { i18n: { en: { value: 'Submitted synopsis' } } },
      },
      user: {},
      layer: {},
      addressMeta: {},
    }
    const enriched = {
      properties: {
        fixture_new_note: {
          propertyId: 'property-note',
          value: 'Row note',
        },
        synopsis: {
          propertyId: 'property-synopsis',
          translatedValues: {
            en: 'English synopsis',
            'zh-hant': 'Traditional synopsis',
            'zh-hans': 'Simplified synopsis',
          },
        },
      },
    }

    const merged = mergeFeatureData(null, submitted, enriched, importCtx)
    const note = merged.properties.find(
      property => property.propertyId === 'property-note',
    )
    const synopsis = merged.properties.find(
      property => property.propertyId === 'property-synopsis',
    )

    expect(note).toMatchObject({
      propertyValueId: null,
      value: 'Row note',
      i18n: null,
    })
    expect(synopsis).toMatchObject({
      propertyValueId: null,
      value: null,
      i18n: {
        en: { value: 'Submitted synopsis', valueGen: false },
        zhHant: { value: 'Traditional synopsis', valueGen: true },
        zhHans: { value: 'Simplified synopsis', valueGen: true },
      },
    })
  })

  it('does not rebuild classifier bindings when row enrichment lacks an option ID', () => {
    const importCtx = createImportCtx(
      new Map([
        [
          'genre',
          {
            propertyId: 'property-genre',
            propertyType: 'classifier',
            resolvedValues: { Crime: 'stale-genre-option' },
          },
        ],
      ]),
    )
    const submitted = {
      feature: {},
      i18n: {},
      properties: {
        genre: { i18n: { en: { value: 'Crime' } } },
      },
      user: {},
      layer: {},
      addressMeta: {},
    }
    const enriched = {
      properties: {
        genre: {
          propertyId: 'property-genre',
        },
      },
    }

    const merged = mergeFeatureData(null, submitted, enriched, importCtx)

    expect(
      merged.properties.find(property => property.propertyId === 'property-genre'),
    ).toBeUndefined()
  })
})
