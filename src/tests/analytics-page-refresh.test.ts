// @vitest-environment jsdom
// TESTS
import { cleanup, render } from '@testing-library/svelte/pure'
import { SvelteMap } from 'svelte/reactivity'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assets: vi.fn(),
  scopes: vi.fn(),
  scope: vi.fn(() => 'account-a'),
  revision: vi.fn(() => 0),
  platform: vi.fn(),
  usage: vi.fn(),
  facets: vi.fn(),
  actions: vi.fn(),
  content: vi.fn(),
}))
vi.mock('$app/env', () => ({ browser: true }))
vi.mock('#lib/context/admin.svelte.js', () => ({
  getAdminCtx: () => ({
    setResourceType: vi.fn(),
    view: {
      scope: { getPrism: () => [] },
      account: {
        get revision() {
          return mocks.revision()
        },
      },
      resources: {
        get scopeKey() {
          return mocks.scope()
        },
      },
    },
  }),
}))
vi.mock('#lib/context/header.svelte.js', () => ({
  getHeaderCtrl: () => ({
    setHeaderForStandAlone: vi.fn(),
    setFacets: mocks.facets,
    setViewActions: mocks.actions,
    setViewActionContent: mocks.content,
    clearFooter: vi.fn(),
  }),
}))
vi.mock('#lib/api/analytics.remote.js', () => ({
  getAnalyticsScopes: mocks.scopes,
  getAssetAnalyticsSummary: mocks.assets,
  getPlatformAnalyticsSummary: mocks.platform,
  getProductAnalyticsSummary: mocks.usage,
}))
vi.mock('#lib/bits/index.js', async () => {
  const component = (await import('./fixtures/components/AnalyticsStateFixture.svelte'))
    .default
  return {
    AssetAnalyticsDashboard: component,
    AssetAnalyticsDashboardSkeleton: component,
  }
})
import Page from '../routes/admin/analytics/+page.svelte'

const originalAnimate = Element.prototype.animate
beforeEach(() => {
  vi.useRealTimers()
  mocks.scopes.mockReturnValue(
    Object.assign(
      Promise.resolve({
        options: [{ type: 'global', label: 'Global' }],
        assets: true,
        data: true,
      }),
      { refresh: vi.fn(async () => {}) },
    ),
  )
  mocks.scope.mockReturnValue('account-a')
  mocks.revision.mockReturnValue(0)
  Element.prototype.animate = () => ({ cancel() {} }) as Animation
})
afterEach(() => {
  cleanup()
  Element.prototype.animate = originalAnimate
  vi.clearAllMocks()
})

it('refreshes the native asset query when the header refresh action is invoked', async () => {
  vi.useRealTimers()
  Element.prototype.animate = () => ({ cancel() {} }) as Animation
  const refresh = vi.fn(async () => {})
  mocks.assets.mockReturnValue(
    Object.assign(
      Promise.resolve({ status: 'error', message: 'Controlled analytics result' }),
      { refresh },
    ),
  )
  render(Page)
  await vi.waitFor(() => expect(mocks.assets).toHaveBeenCalledOnce())
  expect(refresh).not.toHaveBeenCalled()
  const actions = mocks.actions.mock.calls.at(-1)?.[0]
  actions[0].onClick()
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce())
})

it.each(['scope', 'revision'] as const)(
  'rejects old asset completion after %s changes',
  async change => {
    vi.useRealTimers()
    Element.prototype.animate = () => ({ cancel() {} }) as Animation
    const identity = new SvelteMap([
      ['scope', 'account-a'],
      ['revision', '0'],
    ])
    mocks.revision.mockImplementation(() => Number(identity.get('revision')))
    mocks.scope.mockImplementation(() => identity.get('scope')!)
    let finishOld!: (value: unknown) => void
    const old = Object.assign(
      new Promise(resolve => {
        finishOld = resolve
      }),
      { refresh: vi.fn() },
    )
    const current = Object.assign(
      Promise.resolve({ status: 'error', message: 'Current account result' }),
      { refresh: vi.fn() },
    )
    mocks.assets.mockReturnValueOnce(old).mockReturnValue(current)
    const view = render(Page)
    await vi.waitFor(() => expect(mocks.assets).toHaveBeenCalledOnce())
    const firstScope = mocks.assets.mock.calls[0][0].meta.scope
    identity.set(change, change === 'scope' ? 'account-b' : '1')
    await vi.waitFor(() => expect(mocks.assets).toHaveBeenCalledTimes(2))
    expect(mocks.assets.mock.calls[1][0].meta.scope).not.toBe(firstScope)
    await vi.waitFor(() =>
      expect(view.getByText('Current account result')).toBeTruthy(),
    )
    finishOld({ status: 'error', message: 'Old account result' })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(view.queryByText('Old account result')).toBeNull()
  },
)

it.each(['views', 'audience', 'data'] as const)(
  'rejects old %s results after an account revision change',
  async facet => {
    const identity = new SvelteMap([['revision', 0]])
    mocks.revision.mockImplementation(() => identity.get('revision')!)
    mocks.assets.mockReturnValue(
      Object.assign(Promise.resolve({ status: 'error', message: 'Asset result' }), {
        refresh: vi.fn(),
      }),
    )
    let finishOld!: (value: unknown) => void
    const old = Object.assign(
      new Promise(resolve => {
        finishOld = resolve
      }),
      { refresh: vi.fn() },
    )
    mocks.platform
      .mockReturnValueOnce(old)
      .mockReturnValue(
        Object.assign(
          Promise.resolve({ status: 'error', message: 'Current platform result' }),
          { refresh: vi.fn() },
        ),
      )
    const view = render(Page)
    await vi.waitFor(() =>
      expect(
        mocks.facets.mock.calls
          .at(-1)?.[0]
          .some((row: { ref: string }) => row.ref === 'assets'),
      ).toBe(true),
    )
    mocks.facets.mock.calls.at(-1)![1].onFacetChange(facet)
    await vi.waitFor(() => expect(mocks.platform).toHaveBeenCalledOnce())
    const firstScope = mocks.platform.mock.calls[0][0].meta.scope
    identity.set('revision', 1)
    await vi.waitFor(() => expect(mocks.platform).toHaveBeenCalledTimes(2))
    expect(mocks.platform.mock.calls[1][0]).toMatchObject({ facet })
    expect(mocks.platform.mock.calls[1][0].meta.scope).not.toBe(firstScope)
    await vi.waitFor(() =>
      expect(view.getByText('Current platform result')).toBeTruthy(),
    )
    finishOld({ status: 'error', message: 'Old platform result' })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(view.queryByText('Old platform result')).toBeNull()
  },
)

it('loads product usage and refreshes its native query handle', async () => {
  mocks.assets.mockReturnValue(
    Object.assign(Promise.resolve({ status: 'error', message: 'Assets' }), {
      refresh: vi.fn(),
    }),
  )
  const refresh = vi.fn(async () => {})
  mocks.usage.mockReturnValue(
    Object.assign(
      Promise.resolve({
        status: 'success',
        environment: 'preview',
        totals: [{ event: 'feature.view', count: 23 }],
        rankings: [],
      }),
      { refresh },
    ),
  )
  const view = render(Page)
  await vi.waitFor(() =>
    expect(
      mocks.facets.mock.calls
        .at(-1)?.[0]
        .some((row: { ref: string }) => row.ref === 'assets'),
    ).toBe(true),
  )
  mocks.facets.mock.calls.at(-1)![1].onFacetChange('usage')
  await vi.waitFor(() => expect(view.getByText('23')).toBeTruthy())
  expect(mocks.platform).not.toHaveBeenCalled()
  mocks.actions.mock.calls.at(-1)![0][0].onClick()
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce())
})

it('shows only scoped facets for delegated members and sends the selected project', async () => {
  mocks.scopes.mockReturnValue(
    Object.assign(
      Promise.resolve({
        options: [{ type: 'project', id: 'p', label: 'Project · p' }],
        assets: false,
        data: false,
      }),
      { refresh: vi.fn(async () => {}) },
    ),
  )
  mocks.usage.mockReturnValue(
    Object.assign(Promise.resolve({ status: 'error', message: 'Scoped usage' }), {
      refresh: vi.fn(),
    }),
  )
  const view = render(Page)
  await vi.waitFor(() => expect(view.getByText('Scoped usage')).toBeTruthy())
  expect(
    mocks.facets.mock.calls.at(-1)?.[0].map((row: { ref: string }) => row.ref),
  ).toEqual(['usage', 'views', 'audience'])
  expect(mocks.usage.mock.calls.at(-1)?.[0].selection).toMatchObject({
    type: 'project',
    id: 'p',
  })
  expect(mocks.assets).not.toHaveBeenCalled()
})
