// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/svelte/pure'
import { afterEach, expect, it, vi } from 'vitest'
import { beginCardSubmission } from '#lib/context/cardSubmission.js'
import Photos from '#lib/bits/patterns/cards/featureCard/components/actions/SubmitNewPhotosAction.svelte'
import NewFeature from '#lib/bits/patterns/cards/featureCard/components/actions/SubmitNewFeatureAction.svelte'
import Missing from '#lib/bits/patterns/cards/featureCard/components/actions/SubmitMissingReportAction.svelte'

const state = vi.hoisted(() => ({
  app: {} as any,
  card: {} as any,
  images: {} as any,
  omni: { close: vi.fn() },
  submit: vi.fn(),
}))
vi.mock('#lib/context/resourceView.svelte.js', () => ({
  getSurfaceCtx: () => state.app,
}))
vi.mock('#lib/context/card.svelte.js', () => ({ getCardCtx: () => state.card }))
vi.mock('#lib/context/image.svelte.js', () => ({ getImageCtx: () => state.images }))
vi.mock('#lib/context/omni.svelte.js', () => ({ getOmniCtx: () => state.omni }))
vi.mock('#lib/client/services/task.js', () => ({
  submitNewFeature: state.submit,
  submitNewPhotos: state.submit,
  submitMissingReport: state.submit,
}))
vi.mock('#lib/i18n.js', () => ({
  getLocaleKey: () => 'en',
  m: new Proxy({}, { get: (_, key) => () => String(key) }),
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it.each(
  [Photos, Missing].flatMap(Component =>
    ['account', 'feature', 'unmount'].map(change => ({ Component, change })),
  ),
)(
  'does not start a submission after $change changes during hierarchy lookup',
  async ({ Component, change }) => {
    vi.useRealTimers()
    let finish!: (value: unknown) => void
    state.app = {
      account: { revision: 1, user: { attribution: 'Author' } },
      resources: { scopeKey: 'first' },
      getHierarchy: vi.fn(
        () =>
          new Promise(resolve => {
            finish = resolve
          }),
      ),
    }
    state.card = {
      userData: { missingReason: 'Missing feature' },
      isSubmitting: false,
      getAttribution: () => 'Author',
      getSubmissionLabel: () => '',
      resetError: vi.fn(),
      setError: vi.fn(),
      resetSubmissionState: vi.fn(),
      setSubmissionLabel: vi.fn(),
      setMode: vi.fn(),
    }
    state.images = {
      getStagedImages: () => [{}],
      getStagedQueue: () => [{}],
      refreshImages: vi.fn(),
      cleanupStagedImages: vi.fn(),
      resetUploadQueue: vi.fn(),
      resetTargetImage: vi.fn(),
      resetActivePreview: vi.fn(),
    }
    const view = render(Component, { feature: { id: 'feature', i18n: {} } as never })
    await fireEvent.click(view.getByRole('button'))
    expect(state.app.getHierarchy).toHaveBeenCalledOnce()
    if (change === 'account') {
      state.app.account.revision++
      state.app.resources.scopeKey = 'second'
    }
    if (change === 'feature')
      await view.rerender({ feature: { id: 'other', i18n: {} } as never })
    if (change === 'unmount') {
      view.unmount()
      expect(state.card.isSubmitting).toBe(false)
    }
    finish({ layer: {}, project: {}, organisation: {} })
    await Promise.resolve()
    await Promise.resolve()
    expect(state.submit).not.toHaveBeenCalled()
    expect(state.card.isSubmitting).toBe(false)
  },
)

it.each(
  [Photos, Missing].flatMap(Component =>
    ['success', 'failure', 'refresh'].flatMap(phase =>
      [false, true].map(newer => ({ Component, phase, newer })),
    ),
  ),
)(
  'does not reset a new feature after a stale completion (phase: $phase, newer submission: $newer)',
  async ({ Component, phase, newer }) => {
    vi.useRealTimers()
    let finish!: () => void, reject!: (error: unknown) => void
    state.submit.mockImplementation(() =>
      phase === 'refresh'
        ? Promise.resolve()
        : new Promise<void>((resolve, fail) => {
            finish = resolve
            reject = fail
          }),
    )
    state.app = {
      account: { revision: 1, user: { attribution: 'Author' } },
      resources: { scopeKey: 'scope' },
      getHierarchy: async () => ({ layer: {}, project: {}, organisation: {} }),
    }
    state.card = {
      userData: { missingReason: 'Original reason' },
      isSubmitting: false,
      getAttribution: () => 'Author',
      getSubmissionLabel: () => '',
      resetError: vi.fn(),
      setError: vi.fn(),
      resetSubmissionState: vi.fn(),
      setSubmissionLabel: vi.fn(),
      setMode: vi.fn(),
    }
    state.images = {
      getStagedImages: () => [{}],
      getStagedQueue: () => [{}],
      refreshImages: vi.fn(),
      cleanupStagedImages: vi.fn(),
      resetUploadQueue: vi.fn(),
      resetTargetImage: vi.fn(),
      resetActivePreview: vi.fn(),
    }
    if (phase === 'refresh')
      state.images.refreshImages.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            finish = resolve
          }),
      )
    const view = render(Component, { feature: { id: 'old', i18n: {} } as never })
    await fireEvent.click(view.getByRole('button'))
    await vi.waitFor(() => expect(state.submit).toHaveBeenCalledOnce())
    if (phase === 'refresh')
      await vi.waitFor(() => expect(state.images.refreshImages).toHaveBeenCalledOnce())
    await view.rerender({ feature: { id: 'new', i18n: {} } as never })
    state.card.userData.missingReason = 'New form reason'
    state.card.validationError = 'New form error'
    if (newer) beginCardSubmission(state.card)
    if (phase === 'failure') reject(new Error('old request failed'))
    else finish()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(state.images.cleanupStagedImages).not.toHaveBeenCalled()
    expect(state.card.setMode).not.toHaveBeenCalled()
    expect(state.card.userData.missingReason).toBe('New form reason')
    expect(state.card.validationError).toBe('New form error')
    expect(state.card.isSubmitting).toBe(newer)
    expect(state.card.resetSubmissionState).toHaveBeenCalledTimes(newer ? 0 : 1)
  },
)

it.each(
  ['draft', 'account', 'unmount', 'current'].flatMap(change =>
    [false, true].map(fails => ({ change, fails })),
  ),
)(
  'owns new-feature completion after $change (failure: $fails)',
  async ({ change, fails }) => {
    vi.useRealTimers()
    let finish!: () => void, reject!: (error: unknown) => void
    state.submit.mockImplementation(
      () =>
        new Promise<void>((resolve, fail) => {
          finish = resolve
          reject = fail
        }),
    )
    state.app = {
      account: { revision: 1 },
      resources: { scopeKey: 'scope' },
      cache: { layer: new Map() },
      draft: {
        current: { feature: { i18n: { en: { title: 'Old draft' } } } },
        reset: vi.fn(() => {
          state.app.draft.current = null
        }),
      },
    }
    state.card = {
      userData: { photos: ['new-photo'] },
      isSubmitting: false,
      getSubmissionLabel: () => '',
      resetError: vi.fn(),
      setError: vi.fn(),
      resetSubmissionState: vi.fn(),
      setSubmissionLabel: vi.fn(),
      setMode: vi.fn(),
    }
    state.images = {
      getStagedImages: () => [{}],
      getStagedQueue: () => [{}],
      resetImages: vi.fn(),
    }
    const view = render(NewFeature)
    await fireEvent.click(view.getByRole('button'))
    await vi.waitFor(() => expect(state.submit).toHaveBeenCalledOnce())
    if (change === 'draft')
      state.app.draft.current = { feature: { i18n: { en: { title: 'New draft' } } } }
    if (change === 'account') state.app.account.revision++
    if (change === 'unmount') {
      view.unmount()
      expect(state.card.isSubmitting).toBe(false)
    }
    state.card.validationError = 'new error'
    if (fails) reject(new Error('request failed'))
    else finish()
    await new Promise(resolve => setTimeout(resolve, 0))
    if (change === 'current') {
      expect(state.card.isSubmitting).toBe(false)
      expect(state.card.resetSubmissionState).toHaveBeenCalledOnce()
      expect(state.app.draft.reset).toHaveBeenCalledTimes(fails ? 0 : 1)
    } else {
      expect(state.app.draft.reset).not.toHaveBeenCalled()
      expect(state.images.resetImages).not.toHaveBeenCalled()
      expect(state.omni.close).not.toHaveBeenCalled()
      expect(state.card.validationError).toBe('new error')
      expect(state.card.userData.photos).toEqual(['new-photo'])
      expect(state.card.isSubmitting).toBe(false)
    }
  },
)

it.each([Photos, Missing])(
  'completes a committed contribution when image refresh fails',
  async Component => {
    vi.useRealTimers()
    state.submit.mockResolvedValue(undefined)
    state.app = {
      account: { revision: 1, user: { attribution: 'Author' } },
      resources: { scopeKey: 'scope' },
      getHierarchy: async () => ({ layer: {}, project: {}, organisation: {} }),
    }
    state.card = {
      userData: { missingReason: 'Reason' },
      isSubmitting: false,
      getAttribution: () => 'Author',
      getSubmissionLabel: () => '',
      resetError: vi.fn(),
      setError: vi.fn(),
      resetSubmissionState: vi.fn(),
      setSubmissionLabel: vi.fn(),
      setMode: vi.fn(),
    }
    state.images = {
      getStagedImages: () => [{}],
      getStagedQueue: () => [{}],
      refreshImages: vi.fn().mockRejectedValue(new Error('refresh offline')),
      cleanupStagedImages: vi.fn(),
      resetUploadQueue: vi.fn(),
      resetTargetImage: vi.fn(),
      resetActivePreview: vi.fn(),
    }
    const view = render(Component, { feature: { id: 'feature', i18n: {} } as never })
    await fireEvent.click(view.getByRole('button'))
    await vi.waitFor(() => expect(state.card.isSubmitting).toBe(false))
    expect(state.submit).toHaveBeenCalledOnce()
    expect(state.images.cleanupStagedImages).toHaveBeenCalledOnce()
    expect(state.card.setMode).toHaveBeenCalledOnce()
    expect(state.card.validationError).toBeUndefined()
  },
)
