// @vitest-environment jsdom
// TESTS
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/svelte/pure'
// SVELTE
import { flushSync } from 'svelte'
// CONTEXT
import { AccountState } from '#lib/context/account.svelte.js'
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import { ResponsiveCtx } from '#lib/context/responsive.svelte.js'
// FIXTURES
import ListMetadataFixture from './fixtures/components/ListMetadataFixture.svelte'

afterEach(cleanup)

it('updates rendered totals when only metadata changes and when it is cleared', () => {
  vi.useRealTimers()
  const view = new ResourceViewCtx(
    new DivisionCtx(),
    new AccountState(),
    new ResponsiveCtx(),
    undefined,
    'admin',
  )
  try {
    render(ListMetadataFixture, { view })
    const total = screen.getByLabelText('Feature total')
    expect(total.textContent).toBe('Unknown')
    view.setListQueryMeta(view.featuresQueryKey(), { data: [], totalCount: 12 })
    flushSync()
    expect(total.textContent).toBe('12')
    view.setListQueryMeta(view.featuresQueryKey(), { data: [], totalCount: 7 })
    flushSync()
    expect(total.textContent).toBe('7')
    view.clearAllCaches()
    flushSync()
    expect(total.textContent).toBe('Unknown')
  } finally {
    cleanup()
    view.dispose()
  }
})

it('bounds metadata history while retaining the most recently refreshed identities', () => {
  const view = new ResourceViewCtx(
    new DivisionCtx(),
    new AccountState(),
    new ResponsiveCtx(),
    undefined,
    'admin',
  )
  try {
    for (let index = 0; index < 128; index++) {
      view.setListQueryMeta(['feature', index], { data: [], totalCount: index })
    }
    view.setListQueryMeta(['feature', 0], { data: [], totalCount: 999 })
    view.setListQueryMeta(['feature', 128], { data: [], totalCount: 128 })
    expect(view.listQueryMeta.size).toBe(128)
    expect(view.getListQueryMeta(['feature', 0])?.totalCount).toBe(999)
    expect(view.getListQueryMeta(['feature', 1])).toBeNull()
    expect(view.getListQueryMeta(['feature', 128])?.totalCount).toBe(128)
  } finally {
    view.dispose()
  }
})
