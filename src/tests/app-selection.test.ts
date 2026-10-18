// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppCtx } from '#lib/context/app.svelte.js'
import { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import { RootCTX } from '#lib/context/root.svelte.js'
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { ResponsiveCtx } from '#lib/context/responsive.svelte.js'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
import type { SessionUser } from '#lib/types.js'
import { navigate } from '#lib/navigation/index.js'

vi.mock('#lib/navigation/index.js', async importOriginal => ({
  ...(await importOriginal<typeof import('#lib/navigation/index.js')>()),
  navigate: vi.fn(),
}))

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})
const feature = (id: string, title = id): FeatureFromCollection =>
  ({
    id,
    i18n: { en: { title } },
    layerId: 'layer',
  }) as unknown as FeatureFromCollection
function setup() {
  const root = new RootCTX(new ResponsiveCtx())
  const app = new AppCtx(
    new DivisionCtx(),
    root.account,
    root.responsive,
    root.cacheCtx,
  )
  const a = feature('a')
  const b = feature('b')
  app.view.cache.feature.set(a.id, a)
  app.view.cache.feature.set(b.id, b)
  return { root, app, a, b }
}

describe('public selection ownership', () => {
  it('resolves fresh resource data while markers and cards share a single identity', () => {
    const { app, a } = setup()
    app.setActiveFeature(a.id, { focus: false, openCard: false, updateUrl: false })
    expect(app.selection.featureId).toBe(a.id)
    app.view.cache.feature.set(a.id, feature(a.id, 'updated'))
    expect(app.getActiveFeature()).toMatchObject({ i18n: { en: { title: 'updated' } } })
    expect(app.selection.feature?.id).toBe(app.selection.featureId)
    app.view.cache.feature.delete(a.id)
    expect(app.getActiveFeature()?.id).toBe(a.id)
    app.dispose()
  })

  it('steps through a collection without losing its context and clears feature focus separately', () => {
    const { app, a, b } = setup()
    app.setActiveCollection(
      {
        id: 'walk',
        type: 'walk',
        items: [a, b],
        i18n: { en: { name: 'Walk' }, zhHant: { name: '' }, zhHans: { name: '' } },
      },
      { focus: false, openCard: false, updateUrl: false },
    )
    app.setActiveFeature(b.id, { focus: false, openCard: false, updateUrl: false })
    expect(app.selection.featureId).toBe(b.id)
    expect(app.selection.collection?.items.map(row => row.id)).toEqual(['a', 'b'])
    app.resetActiveFeature()
    expect(app.selection.featureId).toBeNull()
    expect(app.selection.collection?.id).toBe('walk')
    app.resetActiveCollection()
    expect(app.selection.collection).toBeNull()
    app.dispose()
  })

  it('honors URL intent independently of card and camera effects', () => {
    const { app, a, b } = setup()
    app.setActiveFeature(a.id, { focus: false, openCard: false, updateUrl: false })
    expect(navigate).not.toHaveBeenCalled()
    app.setActiveFeature(b.id, { focus: false, openCard: false })
    expect(navigate).toHaveBeenCalledWith('feature', b.id, undefined)
    app.dispose()
  })

  it('cancels delayed card openings and transition timers on replacement, dismissal and disposal', () => {
    vi.useFakeTimers()
    const { app, a, b } = setup()
    const open = vi.fn()
    window.addEventListener('OmniCtx.openCard', open)
    app.setActiveFeature(a.id, { openCardDelay: 500, updateUrl: false })
    app.setActiveFeature(b.id, { focus: false, openCard: false, updateUrl: false })
    vi.advanceTimersByTime(600)
    expect(open).not.toHaveBeenCalled()
    app.setActiveFeature(a.id, { openCardDelay: 500, updateUrl: false })
    app.resetActiveFeature()
    vi.runAllTimers()
    expect(open).not.toHaveBeenCalled()
    expect(app.isTransitioning).toBe(false)
    app.setActiveFeature(b.id, { openCardDelay: 500, updateUrl: false })
    app.dispose()
    vi.runAllTimers()
    expect(open).not.toHaveBeenCalled()
    window.removeEventListener('OmniCtx.openCard', open)
  })

  it('clears selection on account changes while admin resource views have no public selection or map commands', () => {
    const { app, root, a } = setup()
    app.setActiveFeature(a.id, { focus: false, openCard: false, updateUrl: false })
    root.sync(
      { id: 'next', roles: [], superAdmin: false } as unknown as SessionUser,
      null,
    )
    app.view.syncAccount()
    expect(app.selection.featureId).toBeNull()
    const admin = new ResourceViewCtx(
      new DivisionCtx(),
      root.account,
      root.responsive,
      root.cacheCtx,
      'admin',
    )
    for (const key of [
      'selection',
      'setActiveFeature',
      'zoomToFeatures',
      'zoomToAllVisibleFeatures',
      'navigation',
    ])
      expect(key in admin).toBe(false)
    for (const key of ['active', 'nav', 'header', 'ui'])
      expect(key in admin.state).toBe(false)
    app.dispose()
    admin.dispose()
  })
})
