import { describe, expect, it } from 'vitest'
import { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import { AccountState } from '#lib/context/account.svelte.js'
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { ResponsiveCtx } from '#lib/context/responsive.svelte.js'
import type { Feature } from '#lib/db/zod/schema/feature.types.js'

/** @returns An independent admin filter owner with the existing resource services. */
function setup() {
  return new ResourceViewCtx(
    new DivisionCtx(),
    new AccountState(),
    new ResponsiveCtx(),
    undefined,
    'admin',
  )
}

describe('resource filters', () => {
  it('preserves the inverted pending-review predicate', () => {
    const view = setup()
    const feature = {
      id: 'f',
      isArchived: false,
      isPendingReview: true,
      images: [],
    } as unknown as Feature
    view.filters.viewFilters.feature.isPendingReview = true
    expect(view.filters.applyFeatureViewFilters([feature])).toEqual([])
    view.filters.viewFilters.feature.isPendingReview = false
    expect(view.filters.applyFeatureViewFilters([feature])).toEqual([feature])
    view.dispose()
  })

  it('resets nested locale state without sharing defaults across surfaces', () => {
    const first = setup(),
      second = setup()
    first.filters.viewFilters.feature.translationLocales.zhHant = false
    expect(second.filters.viewFilters.feature.translationLocales.zhHant).toBe(true)
    first.filters.resetViewFilters()
    expect(first.filters.viewFilters.feature.translationLocales.zhHant).toBe(true)
    first.filters.viewFilters.feature.translationLocales.zhHant = false
    first.filters.resetViewFilters()
    expect(first.filters.viewFilters.feature.translationLocales.zhHant).toBe(true)
    first.dispose()
    second.dispose()
  })

  it('constructs detached query input and composes explicit list filters', () => {
    const view = setup()
    view.scope.prisms.layer = ['layer']
    view.filters.values.feature.text = ' tea '
    const input = view.filters.featureQueryInput({
      filters: { list: { listId: 'wishlist' } },
    })
    view.scope.prisms.layer.push('other')
    expect(input.prisms?.layer).toEqual(['layer'])
    expect(input.q).toBe('tea')
    expect(input.filters?.list).toEqual({ listId: 'wishlist' })
    view.dispose()
  })
})
