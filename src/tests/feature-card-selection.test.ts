// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/svelte/pure'
import { flushSync } from 'svelte'
import { SvelteMap } from 'svelte/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppSelection } from '#lib/context/appSelection.svelte.js'
import { SurfaceNavigation } from '#lib/context/surfaceNavigation.svelte.js'
import FeaturePage from '../routes/(public)/(app)/features/[id]/+page.svelte'
import type { Feature } from '#lib/db/zod/schema/feature.types.js'

const mocks = vi.hoisted(() => ({
  app: null as any,
  imageOptions: null as any,
}))
vi.mock('$app/state', () => ({
  page: { params: { id: 'a' }, url: new URL('http://localhost/features/a') },
}))
vi.mock('#lib/context/app.svelte.js', () => ({ getAppCtx: () => mocks.app }))
vi.mock('#lib/context/omni.svelte.js', () => ({
  getOmniCtx: () => ({
    setCardCtx: vi.fn(),
    isColdStart: () => false,
    state: { mode: 'feature' },
    setMode: vi.fn(),
  }),
}))
vi.mock('#lib/context/card.svelte.js', () => ({
  setCardCtx: vi.fn(),
  getCardCtx: () => ({}),
}))
vi.mock('#lib/adapters/image/index.js', () => ({
  useImageProviderModel: (_page: unknown, options: () => unknown) => {
    mocks.imageOptions = options
    return {}
  },
}))
vi.mock(
  '#lib/providers/ImageProvider.svelte',
  () => import('./mocks/svelte-component.svelte'),
)
vi.mock('#lib/bits/index.js', async () => ({
  FeatureCard: (await import('./mocks/SelectedFeatureCard.svelte')).default,
}))

afterEach(cleanup)

const feature = (id: string, title: string): Feature =>
  ({
    id,
    i18n: { en: { title } },
    images: [],
    image: null,
  }) as unknown as Feature

describe('mounted public feature card', () => {
  it('follows shared selection, refreshed records and history without relying on route params', async () => {
    const a = feature('a', 'First feature')
    const b = feature('b', 'Second feature')
    const records = new SvelteMap([
      ['a', a],
      ['b', b],
    ])
    const selection = new AppSelection(id => records.get(id))
    const navigation = new SurfaceNavigation()
    navigation.syncUrl(new URL('http://localhost/features/a'), 'app')
    mocks.app = {
      selection,
      navigation,
      getActiveFeature: () => selection.feature,
      getActiveCollection: () => null,
      view: {
        getHierarchySync: () => ({}),
        getFeatureById: vi.fn(async (id: string) => records.get(id)),
      },
      resetActiveFeature: () => selection.clearFeature(),
      setActiveFeature: (id: string) => selection.select(records.get(id)!),
    }
    render(FeaturePage)
    await vi.waitFor(() =>
      expect(screen.getByTestId('selected-feature').textContent).toContain(
        'First feature',
      ),
    )
    const card = screen.getByTestId('selected-feature')

    // Marker/collection selection changes before the route params are replaced.
    selection.select(b)
    flushSync()
    expect(screen.getByTestId('selected-feature')).toBe(card)
    expect(card.textContent).toContain('Second feature')
    expect(mocks.imageOptions().context.ctxId).toBe('b')

    // The selected identity resolves fresh resource data without another navigation.
    records.set('b', feature('b', 'Updated second feature'))
    flushSync()
    expect(card.textContent).toContain('Updated second feature')

    // Shallow URL/history projection is authoritative even while page.params stays at a.
    navigation.syncUrl(new URL('http://localhost/features/b'), 'app')
    flushSync()
    await vi.waitFor(() =>
      expect(mocks.app.view.getFeatureById).toHaveBeenCalledWith('b', false),
    )
    expect(selection.featureId).toBe('b')
    navigation.syncUrl(new URL('http://localhost/features/a'), 'app')
    flushSync()
    await vi.waitFor(() =>
      expect(screen.getByTestId('selected-feature').textContent).toContain(
        'First feature',
      ),
    )
    expect(mocks.imageOptions().context.ctxId).toBe('a')
  })
})
