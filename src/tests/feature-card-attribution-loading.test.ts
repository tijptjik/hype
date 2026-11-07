// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Attribution from '#lib/bits/patterns/cards/featureCard/components/images/FeatureCardViewerAttribution.svelte'
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'
const originalAnimate = Element.prototype.animate
const mocks = vi.hoisted(() => ({
  credit: vi.fn(),
  ensure: vi.fn(),
  activeId: 'one',
  metadata: null as unknown,
}))
vi.mock('#lib/api/user.remote.js', () => ({ getUserForAttribution: mocks.credit }))
vi.mock('#lib/context/resourceView.svelte.js', () => ({
  getSurfaceCtx: () => ({
    isAdmin: () => false,
    cache: {
      feature: {
        get: (id: string) => ({
          contributorId: id === 'feature' ? 'record-author' : `record-${id}`,
          createdAt: '2020-01-01',
        }),
      },
    },
  }),
}))
vi.mock('#lib/context/image.svelte.js', () => ({ getImageCtx: () => ({}) }))
vi.mock('#lib/adapters/image/index.js', () => ({
  useImageEditorGalleryModel: () => ({
    state: {
      get activeId() {
        return mocks.activeId
      },
      get metadata() {
        return mocks.metadata
      },
      isMetadataLoading: false,
    },
    actions: { ensureMetadataLoaded: mocks.ensure },
  }),
}))
beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  // Browser checks cover panel geometry; jsdom only needs the observer lifecycle.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  // JSDOM has no Web Animations API for the popover's existing fly transition.
  Element.prototype.animate = () => ({ cancel() {} }) as Animation
  mocks.activeId = 'one'
  mocks.metadata = null
  mocks.ensure.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  Element.prototype.animate = originalAnimate
  vi.unstubAllGlobals()
})
function envelope(id: string): ImageCtxEnvelope {
  return {
    ctxType: 'feature',
    ctxId: 'feature',
    image: { id, contributorId: `photo-${id}`, createdAt: '2026-01-01' },
  } as ImageCtxEnvelope
}

it('loads metadata only on demand and ignores a previous image’s late photographer', async () => {
  let oldResolve!: (value: unknown) => void
  mocks.credit.mockImplementation(({ id }: { id: string }) =>
    id === 'photo-one'
      ? new Promise(resolve => {
          oldResolve = resolve
        })
      : Promise.resolve({ attribution: id }),
  )
  const view = render(Attribution, { currentImage: envelope('one') })
  expect(mocks.ensure).not.toHaveBeenCalled()
  await fireEvent.click(
    view.getByRole('button', { name: 'Attribution and image details' }),
  )
  await waitFor(() => expect(mocks.ensure).toHaveBeenCalledTimes(1))
  mocks.activeId = 'two'
  await view.rerender({ currentImage: envelope('two') })
  await waitFor(() => expect(view.getByText('photo-two')).toBeTruthy())
  oldResolve({ attribution: 'Wrong old photographer' })
  await waitFor(() => expect(view.queryByText('Wrong old photographer')).toBeNull())
  expect(view.getByText('record-author')).toBeTruthy()
  expect(view.getByText('Date unknown')).toBeTruthy()
})

it('ignores a previous Feature’s late contributor when the record changes', async () => {
  let resolveOldRecord!: (value: unknown) => void
  mocks.credit.mockImplementation(({ id }: { id: string }) =>
    id === 'record-author'
      ? new Promise(resolve => {
          resolveOldRecord = resolve
        })
      : Promise.resolve({ attribution: id }),
  )
  const view = render(Attribution, { currentImage: envelope('one') })
  await fireEvent.click(
    view.getByRole('button', { name: 'Attribution and image details' }),
  )
  await waitFor(() => expect(resolveOldRecord).toBeTypeOf('function'))
  await view.rerender({
    currentImage: { ...envelope('one'), ctxId: 'other-feature' },
  })
  await waitFor(() => expect(view.getByText('record-other-feature')).toBeTruthy())
  resolveOldRecord({ attribution: 'Wrong old record contributor' })
  await waitFor(() =>
    expect(view.queryByText('Wrong old record contributor')).toBeNull(),
  )
  expect(view.getByText('record-other-feature')).toBeTruthy()
})

it('keeps dates unknown and uses retained credit when profiles are unavailable', async () => {
  mocks.credit.mockRejectedValue(new Error('Profile unavailable'))
  const currentImage = envelope('one')
  currentImage.image.attribution = 'Retained photograph credit'
  const view = render(Attribution, { currentImage })
  await fireEvent.click(
    view.getByRole('button', { name: 'Attribution and image details' }),
  )
  await waitFor(() => expect(mocks.credit).toHaveBeenCalledTimes(2))
  expect(view.getByText('Retained photograph credit')).toBeTruthy()
  expect(view.getByText('Date unknown')).toBeTruthy()
  expect(view.getByText('No public attribution')).toBeTruthy()
})
