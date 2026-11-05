// @vitest-environment jsdom
// TESTS
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// TYPES
import type { UserProfile } from '#lib/db/zod/schema/user.types.js'
import type { UserContributionsModel } from '#lib/adapters/panels/userContributions.js'

vi.mock('#lib/bits/index.js', async () => ({
  Icon: (await import('./mocks/svelte-component.svelte')).default,
}))
vi.mock('#lib/bits/custom/scrollbar/index.js', async () => ({
  Scrollbar: (await import('./mocks/svelte-component.svelte')).default,
}))
vi.mock('#lib/client/services/image.js', () => ({
  getURLfromImage: ({ image }: { image: { image: { id: string } } }) =>
    `/images/${image.image.id}`,
}))
import ContributedImages from '#lib/bits/patterns/panels/sections/contributedImages/ContributedImagesSection.svelte'

const photo = (id: string) => ({
  image: { id, createdAt: '2026-01-01' },
  ctxType: 'feature',
  ctxId: `f-${id}`,
})
const profile = (count: number, id = 'user'): UserProfile =>
  ({
    id,
    username: id,
    contributedFeatures: {},
    contributedImages: {
      first: Array.from({ length: Math.min(count, 24) }, (_, i) => `${id}-${i}`),
      second: Array.from(
        { length: Math.max(count - 24, 0) },
        (_, i) => `${id}-${i + 24}`,
      ),
    },
  }) as unknown as UserProfile
let model: UserContributionsModel
beforeEach(() => {
  vi.useRealTimers()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
  model = {
    getImages: vi.fn(async (_id: string, ids: string[]) => ids.map(photo)),
    getProjectHierarchy: vi.fn(async () => ({})),
    getOrganisationName: () => '',
    getProjectName: () => '',
    getProjectTitle: () => '',
    onContributedImage: vi.fn(),
  } as unknown as UserContributionsModel
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('loads only 24 tiles and one project header, then appends one batch', async () => {
  const userData = profile(1000)
  const view = render(ContributedImages, { userData, model })
  await screen.findByRole('button', { name: 'Load more' })
  expect(model.getImages).toHaveBeenCalledExactlyOnceWith(
    'user',
    Array.from({ length: 24 }, (_, i) => `user-${i}`),
  )
  expect(model.getProjectHierarchy).toHaveBeenCalledExactlyOnceWith('first')
  expect(screen.getAllByRole('link')).toHaveLength(24)
  await view.rerender({ userData: { ...userData, username: 'renamed' }, model })
  expect(model.getImages).toHaveBeenCalledTimes(1)
  await fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
  await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(48))
  expect(model.getImages).toHaveBeenCalledTimes(2)
  expect(model.getProjectHierarchy).toHaveBeenCalledTimes(2)
})

it('shows skeletons during a page read and preserves collection navigation on click', async () => {
  let release!: () => void
  const pending = new Promise<void>(resolve => {
    release = resolve
  })
  vi.mocked(model.getImages).mockImplementation(async (_id, ids) => {
    await pending
    return ids.map(photo) as never
  })
  render(ContributedImages, { userData: profile(1), model })
  await screen.findByRole('status')
  expect(screen.queryAllByRole('link')).toHaveLength(0)
  release()
  const link = await screen.findByRole('link')
  expect(screen.queryByRole('status')).toBeNull()
  await fireEvent.click(link)
  expect(model.onContributedImage).toHaveBeenCalledWith(
    'f-user-0',
    'first',
    'user-0',
    '',
    'user',
    expect.any(Map),
    { first: ['user-0'], second: [] },
  )
})

it('retries the same IDs without skipping failed pages or discarding existing photos', async () => {
  render(ContributedImages, { userData: profile(25), model })
  await screen.findByRole('button', { name: 'Load more' })
  vi.mocked(model.getImages).mockRejectedValueOnce(new TypeError('NetworkError'))
  await fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
  await screen.findByRole('alert')
  expect(screen.getAllByRole('link')).toHaveLength(24)
  await fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
  await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(25))
  expect(vi.mocked(model.getImages).mock.calls.slice(1)).toEqual([
    ['user', ['user-24']],
    ['user', ['user-24']],
  ])
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
})

it('consumes inaccessible IDs rather than repeatedly fetching missing photos', async () => {
  vi.mocked(model.getImages).mockResolvedValue([])
  render(ContributedImages, { userData: profile(25), model })
  await screen.findByRole('button', { name: 'Load more' })
  await fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  expect(model.getImages).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  expect(model.getProjectHierarchy).not.toHaveBeenCalled()
})

it('ignores a late page from a previous profile', async () => {
  let release!: () => void
  const pending = new Promise<void>(resolve => {
    release = resolve
  })
  vi.mocked(model.getImages).mockImplementation(async (id, ids) => {
    if (id === 'old') await pending
    return ids.map(photo) as never
  })
  const view = render(ContributedImages, { userData: profile(1000, 'old'), model })
  await waitFor(() => expect(model.getImages).toHaveBeenCalledTimes(1))
  await view.rerender({ userData: profile(1, 'new'), model })
  await screen.findByRole('link')
  release()
  await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(1))
  expect(screen.getByRole('link').getAttribute('href')).toBe('/features/f-new-0')
  expect(model.getProjectHierarchy).toHaveBeenCalledTimes(1)
})

it('uses owner-scoped private thumbnails without making them navigable', async () => {
  const userData = profile(1)
  userData.privateContributions = {
    features: {},
    images: {
      'user-0': {
        image: photo('user-0').image,
        projectId: 'first',
        featureId: 'private-feature',
        status: 'submitted',
      },
    },
  } as unknown as UserProfile['privateContributions']
  render(ContributedImages, { userData, model })
  await waitFor(() => expect(document.querySelector('img')).not.toBeNull())
  expect(model.getImages).not.toHaveBeenCalled()
  expect(screen.queryByRole('link')).toBeNull()
})
