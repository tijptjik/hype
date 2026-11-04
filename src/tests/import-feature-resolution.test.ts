import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getFeatureForImport } from '#lib/api/feature.remote.js'
import {
  fetchExistingFeature,
  initializeFeatureResolution,
  mergeFeatureData,
  refreshFeatureResolution,
  processFeatureResolutionQueue,
} from '#lib/client/services/import/features/resolution.js'

import type { ImportCtx } from '#lib/context/import.svelte.js'

vi.mock('#lib/api/feature.remote.js', () => ({
  featureForm: {},
  getFeatureForImport: vi.fn(),
}))

vi.mock('#lib/client/services/feature.js', () => ({
  toFeatureFormInput: vi.fn(),
}))

beforeEach(() => vi.mocked(getFeatureForImport).mockReset())

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

it('keeps fourth-language content and verification through an unrelated import merge', () => {
  const importCtx = createImportCtx(new Map())
  const merged = mergeFeatureData(
    {
      id: 'feature',
      i18n: {
        ja: {
          title: '喫茶店',
          titleGen: true,
          description: '<p>説明</p>',
          descriptionGen: false,
        },
      },
      properties: [],
    } as never,
    { feature: { tangible: true } } as never,
    {} as never,
    importCtx,
  )
  expect(merged.i18n?.ja).toMatchObject({
    locale: 'ja',
    title: '喫茶店',
    titleGen: true,
    description: '<p>説明</p>',
    descriptionGen: false,
  })
  expect(merged.i18n?.en?.title).not.toBe('喫茶店')
})

it('rechecks a missing import Feature after it has been created', async () => {
  vi.mocked(getFeatureForImport)
    .mockResolvedValueOnce({ data: null } as never)
    .mockResolvedValueOnce({ data: { id: 'newly-created' } } as never)
  expect(await fetchExistingFeature('newly-created')).toBeNull()
  expect(await fetchExistingFeature('newly-created')).toEqual({ id: 'newly-created' })
})

it('retries an import lookup after a transient failure', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getFeatureForImport)
    .mockRejectedValueOnce(new Error('temporary lookup failure'))
    .mockResolvedValueOnce({ data: { id: 'retry-lookup' } } as never)
  try {
    await expect(fetchExistingFeature('retry-lookup')).rejects.toThrow(
      'temporary lookup failure',
    )
    expect(await fetchExistingFeature('retry-lookup')).toEqual({ id: 'retry-lookup' })
  } finally {
    log.mockRestore()
  }
})

it('does not reuse a prior successful import lookup after access changes', async () => {
  vi.mocked(getFeatureForImport)
    .mockResolvedValueOnce({ data: { id: 'revoked-lookup' } } as never)
    .mockResolvedValueOnce({ data: null } as never)
  expect(await fetchExistingFeature('revoked-lookup')).toEqual({ id: 'revoked-lookup' })
  expect(await fetchExistingFeature('revoked-lookup')).toBeNull()
})

it('refreshes a retained native import query before returning its current value', async () => {
  const query = Object.assign(Promise.resolve({ data: { id: 'old' } }), {
    current: { data: { id: 'old' } },
    refresh: vi.fn(async () => {
      query.current = { data: { id: 'fresh' } }
    }),
  })
  vi.mocked(getFeatureForImport).mockReturnValueOnce(query as never)
  expect(await fetchExistingFeature('native-refresh')).toEqual({ id: 'fresh' })
  expect(query.refresh).toHaveBeenCalledOnce()
})

it('deduplicates initialization lookups locally and rereads them on the next initialization', async () => {
  const data = [['duplicate'], ['duplicate']]
  const headers = ['id']
  const columns = [
    {
      header: 'id',
      modelType: 'Feature',
      field: 'id',
      propertyKey: 'id',
      locale: 'None',
    },
  ]
  const ctx = Object.assign(createImportCtx(new Map()), {
    getData: () => data,
    getHeaders: () => headers,
    getColumns: () => columns,
    getRowEnrichedData: () => ({}),
  }) as unknown as ImportCtx
  vi.mocked(getFeatureForImport).mockResolvedValue({ data: null } as never)
  const first = await initializeFeatureResolution(ctx)
  expect(first).toHaveLength(2)
  expect(first.every(row => row.hasProvidedIdWithoutMatch)).toBe(true)
  expect(getFeatureForImport).toHaveBeenCalledTimes(1)
  await initializeFeatureResolution(ctx)
  expect(getFeatureForImport).toHaveBeenCalledTimes(2)
})

it.each(['resolve', 'reject'])(
  'does not publish a late %s after the import data is replaced',
  async outcome => {
    let settle!: (value: unknown) => void
    let fail!: (error: Error) => void
    vi.mocked(getFeatureForImport).mockReturnValueOnce(
      new Promise((resolve, reject) => {
        settle = resolve
        fail = reject
      }) as never,
    )
    let data = [['old-feature']]
    const ctx = Object.assign(createImportCtx(new Map()), {
      getData: () => data,
      getHeaders: () => headers,
      getColumns: () => columns,
      getRowEnrichedData: () => ({}),
      setFeatureResolutionResults: vi.fn(),
      updateFeatureResolution: vi.fn(),
    }) as unknown as ImportCtx
    const headers = ['id']
    const columns = [
      {
        header: 'id',
        modelType: 'Feature',
        field: 'id',
        propertyKey: 'id',
        locale: 'None',
      },
    ]
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const pending = refreshFeatureResolution(ctx, true)
      data = []
      if (outcome === 'resolve') settle({ data: null })
      else fail(new Error('old request failed'))
      expect(await pending).toEqual([])
      expect(ctx.setFeatureResolutionResults).not.toHaveBeenCalled()
      expect(ctx.updateFeatureResolution).not.toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
  },
)

it('keeps the newer resolution when two refreshes finish out of order', async () => {
  let finishOld!: (value: unknown) => void
  vi.mocked(getFeatureForImport)
    .mockReturnValueOnce(
      new Promise(resolve => {
        finishOld = resolve
      }) as never,
    )
    .mockResolvedValueOnce({ data: null } as never)
  const data = [['same-feature']]
  const headers = ['id']
  const columns = [
    {
      header: 'id',
      modelType: 'Feature',
      field: 'id',
      propertyKey: 'id',
      locale: 'None',
    },
  ]
  const ctx = Object.assign(createImportCtx(new Map()), {
    getData: () => data,
    getHeaders: () => headers,
    getColumns: () => columns,
    getRowEnrichedData: () => ({}),
    setFeatureResolutionResults: vi.fn(),
    updateFeatureResolution: vi.fn(),
  }) as unknown as ImportCtx
  const old = refreshFeatureResolution(ctx, true)
  const current = await refreshFeatureResolution(ctx, false)
  expect(current[0].status).toBe('skipped')
  finishOld({ data: null })
  expect(await old).toEqual([])
  expect(ctx.setFeatureResolutionResults).toHaveBeenCalledExactlyOnceWith(current)
  expect(ctx.updateFeatureResolution).toHaveBeenCalledOnce()
})

it.each(['reset', 'replace-results', 'reject-after-reset'])(
  'stops a pending submission queue on %s',
  async scenario => {
    let finishLookup!: (value: unknown) => void
    let failLookup!: (error: Error) => void
    vi.mocked(getFeatureForImport)
      .mockReturnValueOnce(
        new Promise((resolve, reject) => {
          finishLookup = resolve
          failLookup = reject
        }) as never,
      )
      .mockResolvedValue({ data: null } as never)
    let data = [['first'], ['second']]
    const headers = ['id']
    const columns: never[] = []
    const results = ['first', 'second'].map(id => ({
      status: 'pending',
      isNew: false,
      submitted: {
        feature: { id },
        i18n: {},
        properties: {},
        layer: {},
        user: {},
        addressMeta: {},
        addressProperties: {},
      },
      enriched: {},
    }))
    const state = { isProcessing: false, results }
    const ctx = Object.assign(createImportCtx(new Map()), {
      getData: () => data,
      getHeaders: () => headers,
      getColumns: () => columns,
      getFeatureResolution: () => state,
      updateFeatureResolution: vi.fn(updates => Object.assign(state, updates)),
      updateFeatureResolutionResult: vi.fn(),
    }) as unknown as ImportCtx
    const pending = processFeatureResolutionQueue(ctx, results as never)
    if (scenario === 'replace-results') state.results = []
    else data = []
    vi.mocked(ctx.updateFeatureResolution).mockClear()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      if (scenario === 'reject-after-reset') failLookup(new Error('old lookup failed'))
      else finishLookup({ data: null })
      await pending
    } finally {
      log.mockRestore()
    }
    expect(getFeatureForImport).toHaveBeenCalledTimes(1)
    expect(ctx.updateFeatureResolutionResult).not.toHaveBeenCalled()
    expect(ctx.updateFeatureResolution).not.toHaveBeenCalled()
  },
)
