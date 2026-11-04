// TESTS
import { expect, it, vi } from 'vitest'
// SERVICES
import {
  getCachedFeatureTranslationTriState,
  calculateTranslationCompletionTriState,
  getCachedFeaturePropertyBoolean,
  calculateClassifierPresence,
  primeFeatureStatsCache,
  calculateContentCompletion,
  calculateImageCompletion,
  getCachedFeatureBoolean,
  getCachedFeatureTriState,
} from '#lib/client/services/stats.js'
import { getCachedFeatureRowModel } from '#lib/client/services/featureRow.js'
// TYPES
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { UserPreferences } from '#lib/db/zod/schema/user.types.js'

/** Creates a minimal view with real per-view stats storage. */
function view(label: string): ResourceViewCtx {
  return {
    cache: {
      stats: new Map(),
      layer: new Map([
        ['layer', { properties: [{ propertyId: 'category', isVisible: true }] }],
      ]),
      property: new Map([
        [
          'category',
          {
            id: 'category',
            key: 'category',
            type: 'classifier',
            component: 'SelectField',
            i18n: { en: { label } },
            values: [],
          },
        ],
      ]),
    },
  } as unknown as ResourceViewCtx
}

/** Creates a row with unchanged revision and mutable presentation inputs. */
function params(id: string) {
  return {
    appCtx: view('First label'),
    feature: {
      id,
      layerId: 'layer',
      properties: [],
      images: [],
      image: { altText: 'Original alt' },
      i18n: { en: { title: 'Title' }, zhHant: { title: '' } },
    } as unknown as Feature,
    localeKey: 'en' as const,
    activeTranslationLocales: ['en', 'zhHant'] as ('en' | 'zhHant')[],
    isSuperAdmin: false,
    userPreferences: {} as UserPreferences,
  }
}

it('does not reuse property labels from another view for the same Feature', () => {
  const input = params('different-views')
  expect(getCachedFeatureRowModel(input).stats.category).toEqual({
    'First label': false,
  })
  expect(
    getCachedFeatureRowModel({ ...input, appCtx: view('Second label') }).stats.category,
  ).toEqual({ 'Second label': false })
})

it('updates translation status when a non-display locale changes without a new revision', () => {
  const input = params('translation-change')
  expect(Object.values(getCachedFeatureRowModel(input).stats.translation)).toContain(
    false,
  )
  input.feature.i18n!.zhHant!.title = '名稱'
  expect(
    Object.values(getCachedFeatureRowModel(input).stats.translation),
  ).not.toContain(false)
})

it('updates image alternative text without requiring a Feature revision change', () => {
  const input = params('alt-change')
  expect(getCachedFeatureRowModel(input).imageAlt).toBe('Original alt')
  input.feature.image = { altText: 'Updated alt' } as never
  expect(getCachedFeatureRowModel(input).imageAlt).toBe('Updated alt')
})

it('rebuilds fallback titles when user locale preferences change', () => {
  const input = params('preference-change')
  input.feature.i18n = {
    en: { title: '' },
    zhHant: { title: 'Traditional title' },
    zhHans: { title: 'Simplified title' },
  } as never
  input.userPreferences = { fallbackLocales: ['zh-hant', 'zh-hans'] } as UserPreferences
  expect(getCachedFeatureRowModel(input).title).toBe('Traditional title')
  input.userPreferences = { fallbackLocales: ['zh-hans', 'zh-hant'] } as UserPreferences
  expect(getCachedFeatureRowModel(input).title).toBe('Simplified title')
})

it('does not reuse primed status after an in-place optimistic edit', () => {
  const input = params('primed-status')
  input.feature.isPublished = false
  primeFeatureStatsCache(input.appCtx, input.feature)
  input.feature.isPublished = true
  expect(
    getCachedFeatureBoolean(
      input.appCtx,
      input.feature,
      'isPublished',
      row => 'isPublished' in row && Boolean(row.isPublished),
    ),
  ).toBe(true)
})

it('does not reuse primed image counts after a fresh row replaces the same identity', () => {
  const input = params('primed-images')
  const old = { ...input.feature, imageCount: 1, imagePublishedCount: 1 }
  primeFeatureStatsCache(input.appCtx, old)
  const current = { ...old, imageCount: 0, imagePublishedCount: 0 }
  expect(
    getCachedFeatureTriState(
      input.appCtx,
      current,
      'isAllImagePublished',
      row => calculateImageCompletion(row).isAllImagePublished,
    ),
  ).toBeNull()
})

it('does not reuse primed content after its translations change', () => {
  const input = params('primed-content')
  primeFeatureStatsCache(input.appCtx, input.feature)
  input.feature.i18n!.en!.title = ''
  expect(
    getCachedFeatureBoolean(
      input.appCtx,
      input.feature,
      'hasTitle',
      row => calculateContentCompletion(input.appCtx, row as Feature).title,
    ),
  ).toBe(false)
})

it('reuses primed statistics while their inputs remain unchanged', () => {
  const input = params('primed-reuse')
  input.feature.isPublished = true
  primeFeatureStatsCache(input.appCtx, input.feature)
  const calculate = vi.fn(() => false)
  expect(
    getCachedFeatureBoolean(input.appCtx, input.feature, 'isPublished', calculate),
  ).toBe(true)
  expect(calculate).not.toHaveBeenCalled()
})

it('invalidates primed locale completion when a translation is added', () => {
  const input = params('primed-locale')
  primeFeatureStatsCache(input.appCtx, input.feature)
  input.feature.i18n!.zhHant!.title = '名稱'
  expect(
    getCachedFeatureTranslationTriState(
      input.appCtx,
      input.feature,
      'isTitleTranslated',
      'zhHant',
      (row, locale) =>
        calculateTranslationCompletionTriState(input.appCtx, row, locale).title,
    ),
  ).toBe(true)
})

it('invalidates property presence when its definition changes component', () => {
  const input = params('primed-definition')
  input.feature.properties = [
    { propertyId: 'category', value: '4', propertyValueId: null },
  ] as never
  primeFeatureStatsCache(input.appCtx, input.feature)
  const property = input.appCtx.cache.property.get('category')!
  input.appCtx.cache.property.set('category', {
    ...property,
    component: 'RangeField',
  } as never)
  expect(
    getCachedFeaturePropertyBoolean(
      input.appCtx,
      input.feature,
      'category',
      calculateClassifierPresence,
    ),
  ).toBe(true)
})

it('bounds primed Feature statistics and calculates evicted rows without retaining them', () => {
  const input = params('retention-0')
  input.feature.isPublished = true
  for (let index = 0; index < 2_000; index++) {
    primeFeatureStatsCache(input.appCtx, { ...input.feature, id: `retention-${index}` })
  }
  // Refreshing an old row should keep it useful when the next page arrives.
  primeFeatureStatsCache(input.appCtx, input.feature)
  primeFeatureStatsCache(input.appCtx, { ...input.feature, id: 'retention-2000' })
  const retained = [...input.appCtx.cache.stats.values()][0]!
  expect(retained.size).toBe(2_000)
  expect(retained.has('retention-0')).toBe(true)
  expect(retained.has('retention-1')).toBe(false)
  const keys = [...retained.keys()]
  const calculate = vi.fn(() => true)
  expect(
    getCachedFeatureBoolean(
      input.appCtx,
      { ...input.feature, id: 'retention-1' },
      'isPublished',
      calculate,
    ),
  ).toBe(true)
  expect(calculate).toHaveBeenCalledOnce()
  expect([...retained.keys()]).toEqual(keys)
})
