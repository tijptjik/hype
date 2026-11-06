// @vitest-environment jsdom
// TESTS
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// TYPES
import type { UserProfile } from '#lib/db/zod/schema/user.types.js'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
import type { UserContributionsModel } from '#lib/adapters/panels/userContributions.js'

vi.mock('#lib', () => ({ formatDistanceToNow: () => 'recently' }))
vi.mock('#lib/bits/index.js', async () => ({
  Icon: (await import('./mocks/svelte-component.svelte')).default,
  ScrollableText: (await import('#lib/bits/custom/text/ScrollableText.svelte')).default,
}))
vi.mock('#lib/bits/custom/scrollbar/index.js', async () => ({
  Scrollbar: (await import('./mocks/svelte-component.svelte')).default,
}))
import ContributedFeatures from '#lib/bits/patterns/panels/sections/contributedFeatures/ContributedFeaturesSection.svelte'

const feature = (id: string) => ({ id, createdAt: '2026-11-01T00:00:00Z' })
const profile = (count: number, id = 'user'): UserProfile =>
  ({
    id,
    username: id,
    image: null,
    attribution: null,
    displayUsername: null,
    contributedImages: {},
    reportedMissingCount: 0,
    newPhotoCount: 0,
    newFeatureCount: 0,
    contributedFeatures: {
      first: Array.from({ length: Math.min(count, 10) }, (_, i) => `${id}-${i}`),
      second: Array.from(
        { length: Math.max(count - 10, 0) },
        (_, i) => `${id}-${i + 10}`,
      ),
    },
  }) as UserProfile
let model: UserContributionsModel
let intersect: (() => void) | undefined
let disconnect: ReturnType<typeof vi.fn>

async function readyForContinuation(): Promise<void> {
  await waitFor(() => expect(intersect).toBeDefined())
}
async function reachBottom(): Promise<void> {
  await readyForContinuation()
  intersect!()
}

beforeEach(() => {
  vi.useRealTimers()
  intersect = undefined
  disconnect = vi.fn()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(): void {
        intersect = () =>
          this.callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          )
      }
      disconnect(): void {
        intersect = undefined
        disconnect()
      }
    },
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
  model = {
    getFeatures: vi.fn(async (_userId: string, ids: string[]) => ids.map(feature)),
    getHierarchy: vi.fn(async () => ({})),
    getProjectHierarchy: vi.fn(async () => ({})),
    getOrganisationName: () => '',
    getProjectName: () => '',
    getProjectTitle: () => '',
    getFeatureName: (feature: FeatureFromCollection) => feature.id,
    getFeatureAddress: () => '',
    onContributedFeature: vi.fn(),
    onContributedImage: vi.fn(),
  } as unknown as UserContributionsModel
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('loads 20 entries across groups and appends without refetching existing rows', async () => {
  const userData = profile(1000)
  const view = render(ContributedFeatures, { userData, model })
  await readyForContinuation()
  expect(model.getFeatures).toHaveBeenCalledTimes(1)
  expect(screen.getAllByRole('link')).toHaveLength(20)
  await view.rerender({ userData: { ...userData, username: 'renamed' }, model })
  expect(model.getFeatures).toHaveBeenCalledTimes(1)
  await reachBottom()
  await readyForContinuation()
  await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(40))
  expect(model.getFeatures).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  view.unmount()
  expect(disconnect).toHaveBeenCalled()
})

it('makes a single bounded request across multiple project groups', async () => {
  render(ContributedFeatures, { userData: profile(45), model })
  await readyForContinuation()
  expect(model.getFeatures).toHaveBeenCalledExactlyOnceWith(
    'user',
    Array.from({ length: 20 }, (_, i) => `user-${i}`),
  )
})

it('stops a failed page and allows retry while preserving already loaded rows', async () => {
  render(ContributedFeatures, { userData: profile(21), model })
  await readyForContinuation()
  vi.mocked(model.getFeatures).mockRejectedValueOnce(new TypeError('NetworkError'))
  await reachBottom()
  await screen.findByRole('alert')
  expect(intersect).toBeUndefined()
  expect(screen.getAllByRole('link')).toHaveLength(20)
  expect(model.getFeatures).toHaveBeenCalledTimes(2)
  await fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
  await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(21))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
})

it('discards late responses and stops scheduling the previous profile after a switch', async () => {
  let release!: () => void
  const pending = new Promise<void>(resolve => {
    release = resolve
  })
  vi.mocked(model.getFeatures).mockImplementation(async (userId, ids) => {
    if (userId === 'old') await pending
    return ids.map(feature) as never
  })
  const view = render(ContributedFeatures, { userData: profile(1000, 'old'), model })
  await waitFor(() => expect(model.getFeatures).toHaveBeenCalledTimes(1))
  await view.rerender({ userData: profile(1, 'new'), model })
  await screen.findByRole('link', { name: /new-0/ })
  release()
  await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(1))
  expect(model.getFeatures).toHaveBeenCalledTimes(2)
})

it('renders private previews without fetching a published feature', async () => {
  const userData = profile(1)
  userData.privateContributions = {
    features: {
      'user-0': {
        id: 'user-0',
        projectId: 'first',
        address: null,
        title: 'Pending place',
        createdAt: '2026-11-01',
        status: 'submitted',
      },
    },
    images: {},
  }
  render(ContributedFeatures, { userData, model })
  await screen.findByText('Pending place')
  expect(model.getFeatures).not.toHaveBeenCalled()
  expect(model.getProjectHierarchy).toHaveBeenCalledWith('first')
})
